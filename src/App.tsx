import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Home from './pages/Home';
import MoleculesPage from './pages/Molecules';
import MoleculeDetailPage from './pages/MoleculeDetail';
import IndicationDetailPage from './pages/IndicationDetail';
import BrandsPage from './pages/Brands';
import BrandDetailPage from './pages/BrandDetail';
import GeneratePage from './pages/Generate';
import PublicationPage from './pages/Publication';
import CampaignsPage from './pages/Campaigns';
import KnowledgeBankPage from './pages/KnowledgeBank';
import MailingPage from './pages/Mailing';
import MailingEditorPage from './pages/MailingEditor';

const App: React.FC = () => (
  <AuthProvider>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Landing pública */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />

          {/* Rutas autenticadas con layout */}
          <Route
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route path="/dashboard" element={<Home />} />
            <Route path="/moleculas" element={<MoleculesPage />} />
            <Route path="/moleculas/:id" element={<MoleculeDetailPage />} />
            <Route path="/moleculas/:molId/indicaciones/:indId" element={<IndicationDetailPage />} />
            <Route path="/marcas" element={<BrandsPage />} />
            <Route path="/marcas/:id" element={<BrandDetailPage />} />
            <Route path="/marcas/:brandId/generar" element={<GeneratePage />} />
            <Route path="/campanas" element={<CampaignsPage />} />
            <Route path="/conocimiento" element={<KnowledgeBankPage />} />
            <Route path="/mailing" element={<MailingPage />} />
            <Route path="/mailing/new" element={<MailingEditorPage />} />
            <Route path="/mailing/:id" element={<MailingEditorPage />} />
            <Route path="/publicaciones/:sessionId" element={<PublicationPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </AuthProvider>
);

export default App;
