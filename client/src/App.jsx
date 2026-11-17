import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import TopBar from './components/TopBar.jsx';
import { Loading } from './components/bits.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Browse from './pages/Browse.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import DonorDashboard from './pages/DonorDashboard.jsx';
import NewListing from './pages/NewListing.jsx';
import MyClaims from './pages/MyClaims.jsx';
import Verify from './pages/Verify.jsx';
import { AdminQueue, AdminUsers } from './pages/Admin.jsx';
import Impact from './pages/Impact.jsx';
import Notifications from './pages/Notifications.jsx';

function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="wrap"><Loading /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function NotFound() {
  return (
    <main className="wrap page">
      <h1>Page not found</h1>
      <p className="muted" style={{ marginTop: 12 }}>The link may be old. Go back to the <a href="/">home page</a>.</p>
    </main>
  );
}

export default function App() {
  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <TopBar />
      <div id="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/donor" element={<Guard roles={['donor']}><DonorDashboard /></Guard>} />
          <Route path="/donor/new" element={<Guard roles={['donor']}><NewListing /></Guard>} />
          <Route path="/claims" element={<Guard roles={['ngo', 'volunteer']}><MyClaims /></Guard>} />
          <Route path="/verify" element={<Guard roles={['ngo', 'volunteer']}><Verify /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><AdminQueue /></Guard>} />
          <Route path="/admin/users" element={<Guard roles={['admin']}><AdminUsers /></Guard>} />
          <Route path="/notifications" element={<Guard><Notifications /></Guard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
}
