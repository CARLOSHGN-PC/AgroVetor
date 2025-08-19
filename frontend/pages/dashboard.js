import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DashboardPage = () => {
  const [ordens, setOrdens] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedOrdem, setSelectedOrdem] = useState(null);

  const API_URL = 'http://localhost:3001/api';

  const fetchOrdens = () => {
    fetch(`${API_URL}/ordens-servico`)
      .then(res => res.json())
      .then(data => setOrdens(data))
      .catch(err => console.error("Failed to fetch ordens de servico", err));
  };

  useEffect(() => {
    fetchOrdens();
  }, []);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUpload = async (ordemId) => {
    if (!selectedFile) {
      alert('Por favor, selecione um arquivo de log.');
      return;
    }

    const formData = new FormData();
    formData.append('logVoo', selectedFile);

    try {
      const response = await fetch(`${API_URL}/ordens-servico/${ordemId}/analisar-voo`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert('Análise iniciada! A página será atualizada.');
        fetchOrdens(); // Refresh the list to show new status
        setSelectedFile(null);
      } else {
        const errorData = await response.json();
        alert(`Falha na análise: ${errorData.message}`);
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      alert('Erro ao enviar arquivo para análise.');
    }
  };

  const m2ToHa = (m2) => (m2 / 10000).toFixed(4);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard Operacional (Pós-Voo)</h1>

      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, marginRight: '20px' }}>
          <h2>Ordens de Serviço</h2>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Piloto</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map(os => (
                <tr key={os.id}>
                  <td>{os.dataOperacao}</td>
                  <td>{os.piloto}</td>
                  <td>{os.status}</td>
                  <td>
                    {os.status === 'Planejada' && (
                      <div>
                        <input type="file" onChange={handleFileChange} />
                        <button onClick={() => handleUpload(os.id)}>Analisar Voo</button>
                      </div>
                    )}
                    {os.status === 'Analisada' && (
                      <button onClick={() => setSelectedOrdem(os)}>Ver Análise</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ flex: 1 }}>
          <h2>Detalhes da Análise</h2>
          {selectedOrdem && selectedOrdem.analysisResult ? (
            <div>
              <h3>Análise para OS do dia {selectedOrdem.dataOperacao}</h3>
              <p><strong>Área Planejada:</strong> {m2ToHa(selectedOrdem.analysisResult.areaTotalPlanejada)} ha</p>
              <p style={{ color: 'green' }}><strong>Área Aplicada no Alvo:</strong> {m2ToHa(selectedOrdem.analysisResult.areaAplicadaCorreta)} ha</p>
              <p style={{ color: 'red' }}><strong>Área com Falha:</strong> {m2ToHa(selectedOrdem.analysisResult.areaDeFalha)} ha</p>
              <p style={{ color: 'orange' }}><strong>Área de Desperdício:</strong> {m2ToHa(selectedOrdem.analysisResult.areaDeDesperdicio)} ha</p>
              <p style={{ color: '#00008B' }}><strong>Área de Sobreposição:</strong> {m2ToHa(selectedOrdem.analysisResult.areaDeSobreposicao)} ha</p>

              <MapContainer center={[-15.77972, -47.92972]} zoom={13} style={{ height: '400px', width: '100%', marginTop: '20px' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {selectedOrdem.analysisResult.geometriaAplicadaCorreta && (
                  <GeoJSON data={selectedOrdem.analysisResult.geometriaAplicadaCorreta} style={{ color: 'green' }} />
                )}
                {selectedOrdem.analysisResult.geometriaFalha && (
                  <GeoJSON data={selectedOrdem.analysisResult.geometriaFalha} style={{ color: 'yellow', fillOpacity: 0.5 }} />
                )}
                {selectedOrdem.analysisResult.geometriaDesperdicio && (
                  <GeoJSON data={selectedOrdem.analysisResult.geometriaDesperdicio} style={{ color: 'red' }} />
                )}
              </MapContainer>
            </div>
          ) : (
            <p>Selecione 'Ver Análise' em uma ordem concluída para ver os detalhes.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
