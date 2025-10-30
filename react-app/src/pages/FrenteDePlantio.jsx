import { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export default function FrenteDePlantio() {
  const [frentes, setFrentes] = useState([]);
  const [formData, setFormData] = useState({ name: '', provider: '', obs: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'frentesDePlantio'), (snapshot) => {
      const frentesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFrentes(frentesData);
    });
    return unsubscribe;
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await updateDoc(doc(db, 'frentesDePlantio', editingId), formData);
      setEditingId(null);
    } else {
      await addDoc(collection(db, 'frentesDePlantio'), formData);
    }
    setFormData({ name: '', provider: '', obs: '' });
  };

  const handleEdit = (frente) => {
    setFormData({ name: frente.name, provider: frente.provider, obs: frente.obs });
    setEditingId(frente.id);
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, 'frentesDePlantio', id));
  };

  return (
    <div>
      <h2>Cadastro de Frentes de Plantio</h2>
      <form onSubmit={handleSubmit}>
        <input name="name" value={formData.name} onChange={handleChange} placeholder="Nome" required />
        <input name="provider" value={formData.provider} onChange={handleChange} placeholder="Prestador" required />
        <textarea name="obs" value={formData.obs} onChange={handleChange} placeholder="Observação"></textarea>
        <button type="submit">{editingId ? 'Atualizar' : 'Adicionar'}</button>
      </form>
      <ul>
        {frentes.map(frente => (
          <li key={frente.id}>
            {frente.name} - {frente.provider}
            <button onClick={() => handleEdit(frente)}>Editar</button>
            <button onClick={() => handleDelete(frente.id)}>Excluir</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
