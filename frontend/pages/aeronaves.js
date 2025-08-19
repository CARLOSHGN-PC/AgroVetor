import React, { useState, useEffect } from 'react';

const AeronavesPage = () => {
  const [aeronaves, setAeronaves] = useState([]);
  const [prefixo, setPrefixo] = useState('');
  const [modelo, setModelo] = useState('');
  const [largura, setLargura] = useState('');

  const API_URL = 'http://localhost:3001/api';

  const fetchAeronaves = () => {
    fetch(`${API_URL}/aeronaves`)
      .then(res => res.json())
      .then(data => {
        setAeronaves(data);
      })
      .catch(err => console.error("Failed to fetch aeronaves", err));
  };

  useEffect(() => {
    fetchAeronaves();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/aeronaves`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefixo,
          modelo,
          largura_faixa_aplicacao: Number(largura),
        }),
      });
      if (response.ok) {
        // Reset form and refresh list
        setPrefixo('');
        setModelo('');
        setLargura('');
        fetchAeronaves();
      } else {
        console.error('Failed to create aeronave');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_URL}/aeronaves/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchAeronaves(); // Refresh list
      } else {
        console.error('Failed to delete aeronave');
      }
    } catch (error) {
      console.error('Error deleting aeronave:', error);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Gerenciamento de Aeronaves</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>Adicionar Nova Aeronave</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Prefixo (ex: PR-ABC)"
            value={prefixo}
            onChange={(e) => setPrefixo(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Modelo"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
          />
          <input
            type="number"
            placeholder="Largura da Faixa (m)"
            value={largura}
            onChange={(e) => setLargura(e.target.value)}
            required
          />
          <button type="submit">Adicionar</button>
        </form>
      </div>

      <h2>Listar Aeronaves</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th style={{ textAlign: 'left' }}>Prefixo</th>
            <th style={{ textAlign: 'left' }}>Modelo</th>
            <th style={{ textAlign: 'left' }}>Largura da Faixa (m)</th>
            <th style={{ textAlign: 'left' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {aeronaves.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{a.prefixo}</td>
              <td>{a.modelo}</td>
              <td>{a.largura_faixa_aplicacao}</td>
              <td>
                <button onClick={() => handleDelete(a.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AeronavesPage;
