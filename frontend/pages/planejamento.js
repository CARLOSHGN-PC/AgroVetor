import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Leaflet Draw requires this to be set manually
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});


const PlanejamentoPage = () => {
  const [aeronaves, setAeronaves] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [piloto, setPiloto] = useState('');
  const [dataOperacao, setDataOperacao] = useState(new Date().toISOString().split('T')[0]);
  const [dosagem, setDosagem] = useState(20);
  const [selectedAeronave, setSelectedAeronave] = useState('');
  const [selectedProduto, setSelectedProduto] = useState('');

  const featureGroupRef = useRef();

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    // Fetch aeronaves
    fetch(`${API_URL}/aeronaves`)
      .then(res => res.json())
      .then(data => setAeronaves(data))
      .catch(err => console.error("Failed to fetch aeronaves", err));

    // Fetch produtos
    fetch(`${API_URL}/produtos`)
      .then(res => res.json())
      .then(data => setProdutos(data))
      .catch(err => console.error("Failed to fetch produtos", err));
  }, []);

  const onCreated = (e) => {
    const layer = e.layer;
    // For simplicity, we only allow one polygon. Clear previous layers.
    featureGroupRef.current.clearLayers();
    featureGroupRef.current.addLayer(layer);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const drawnLayers = featureGroupRef.current.getLayers();
    if (drawnLayers.length === 0) {
      alert('Por favor, desenhe ou importe a área do talhão no mapa.');
      return;
    }

    const geojson = drawnLayers[0].toGeoJSON();

    try {
      // The backend now accepts the GeoJSON object directly.
      const response = await fetch(`${API_URL}/ordens-servico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataOperacao,
          piloto,
          aeronaveId: selectedAeronave,
          produtoId: selectedProduto,
          dosagem: Number(dosagem),
          geometriaPlanejada: geojson, // Sending the GeoJSON object directly
          status: 'Planejada',
        }),
      });

      if (response.ok) {
        alert('Ordem de Serviço criada com sucesso!');
        // clear form, etc.
        featureGroupRef.current.clearLayers();
        setPiloto('');
        // You might want to clear other fields as well
      } else {
        const errorData = await response.json();
        alert(`Falha ao criar Ordem de Serviço: ${errorData.message}`);
      }
    } catch (error) {
      console.error('Erro ao criar Ordem de Serviço:', error);
      alert('Erro ao criar Ordem de Serviço.');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Planejamento de Voo (Pré-Voo)</h1>

      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, marginRight: '20px' }}>
          <h3>1. Desenhe a Área de Aplicação</h3>
          <MapContainer center={[-15.77972, -47.92972]} zoom={5} style={{ height: '500px', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topright"
                onCreated={onCreated}
                draw={{
                  rectangle: false,
                  circle: false,
                  circlemarker: false,
                  marker: false,
                  polyline: false,
                }}
              />
            </FeatureGroup>
          </MapContainer>
        </div>

        <div style={{ flex: 1 }}>
          <h3>2. Detalhes da Ordem de Serviço</h3>
          <form onSubmit={handleSubmit}>
            <div>
              <label>Data da Operação:</label>
              <input type="date" value={dataOperacao} onChange={e => setDataOperacao(e.target.value)} required />
            </div>
            <div>
              <label>Piloto:</label>
              <input type="text" placeholder="Nome do Piloto" value={piloto} onChange={e => setPiloto(e.target.value)} required />
            </div>
            <div>
              <label>Aeronave:</label>
              <select value={selectedAeronave} onChange={e => setSelectedAeronave(e.target.value)} required>
                <option value="">Selecione uma Aeronave</option>
                {aeronaves.map(a => <option key={a.id} value={a.id}>{a.prefixo} - {a.modelo}</option>)}
              </select>
            </div>
            <div>
              <label>Produto:</label>
              <select value={selectedProduto} onChange={e => setSelectedProduto(e.target.value)} required>
                <option value="">Selecione um Produto</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label>Dosagem (L/ha):</label>
              <input type="number" value={dosagem} onChange={e => setDosagem(e.target.value)} required />
            </div>
            <button type="submit" style={{ marginTop: '20px' }}>Criar Ordem de Serviço</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PlanejamentoPage;
