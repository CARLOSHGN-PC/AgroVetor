import React, { useState, useEffect } from 'react';

const ProdutosPage = () => {
  const [produtos, setProdutos] = useState([]);
  const [nome, setNome] = useState('');
  const [ingredienteAtivo, setIngredienteAtivo] = useState('');

  const API_URL = 'http://localhost:3001/api';

  const fetchProdutos = () => {
    fetch(`${API_URL}/produtos`)
      .then(res => res.json())
      .then(data => {
        setProdutos(data);
      })
      .catch(err => console.error("Failed to fetch produtos", err));
  };

  useEffect(() => {
    fetchProdutos();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/produtos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome,
          ingredienteAtivo,
        }),
      });
      if (response.ok) {
        // Reset form and refresh list
        setNome('');
        setIngredienteAtivo('');
        fetchProdutos();
      } else {
        console.error('Failed to create produto');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_URL}/produtos/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchProdutos(); // Refresh list
      } else {
        console.error('Failed to delete produto');
      }
    } catch (error) {
      console.error('Error deleting produto:', error);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Gerenciamento de Produtos de Pulverização</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>Adicionar Novo Produto</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Nome do Produto"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Ingrediente Ativo"
            value={ingredienteAtivo}
            onChange={(e) => setIngredienteAtivo(e.target.value)}
          />
          <button type="submit">Adicionar</button>
        </form>
      </div>

      <h2>Listar Produtos</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th style={{ textAlign: 'left' }}>Nome</th>
            <th style={{ textAlign: 'left' }}>Ingrediente Ativo</th>
            <th style={{ textAlign: 'left' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {produtos.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{p.nome}</td>
              <td>{p.ingredienteAtivo}</td>
              <td>
                <button onClick={() => handleDelete(p.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProdutosPage;
