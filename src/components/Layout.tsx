import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/moleculas', label: 'Moléculas', icon: MoleculeIcon },
  { to: '/marcas', label: 'Marcas', icon: BrandIcon },
  { to: '/campanas', label: 'Campañas', icon: CampaignIcon },
  { to: '/conocimiento', label: 'Conocimiento', icon: KnowledgeIcon },
];

function KnowledgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function MoleculeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="6" r="2" />
      <circle cx="20" cy="6" r="2" />
      <circle cx="4" cy="18" r="2" />
      <circle cx="20" cy="18" r="2" />
      <line x1="9.5" y1="10" x2="5.5" y2="7.5" />
      <line x1="14.5" y1="10" x2="18.5" y2="7.5" />
      <line x1="9.5" y1="14" x2="5.5" y2="16.5" />
      <line x1="14.5" y1="14" x2="18.5" y2="16.5" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
    </svg>
  );
}

function BrandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 8h8M8 12h5M8 16h3" />
    </svg>
  );
}

function CampaignIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

const Layout: React.FC = () => {
  const { user } = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen flex bg-[#f0f2f5]">
      {/* Sidebar */}
      <aside className="w-64 bg-linear-to-b from-[#0f172a] to-[#1e293b] flex flex-col shrink-0 print:hidden shadow-xl shadow-black/10">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5">
          <div className="w-9 h-9 rounded-xl bg-linear-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <span className="text-[15px] font-bold text-white tracking-tight">PharmaDesign</span>
            <span className="block text-[10px] font-medium text-blue-400 uppercase tracking-widest">AI Studio</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Principal</p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                  isActive
                    ? 'bg-white/10 text-white shadow-md shadow-blue-500/10 backdrop-blur-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <item.icon className="w-[18px] h-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-[12px] font-bold text-white shadow-md shadow-blue-500/20">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 truncate font-medium">{user?.email}</p>
              <button
                onClick={handleLogout}
                className="text-[11px] text-slate-500 hover:text-red-400 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 lg:p-8 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
