import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <h1>Bem-vindo ao Dashboard</h1>
      <nav>
        <Link to="/frente-de-plantio">Gerenciar Frentes de Plantio</Link>
      </nav>
      <button onClick={handleLogout} className="logout-btn">
        Sair
      </button>
    </div>
  );
}
