import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Auth from './components/Login';
import AttendeeManager from './components/AttendeeManager';
import GateScanner from './components/GateScanner';
import { LogOut, Users, QrCode, ShieldCheck } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('attendees'); // 'attendees' | 'scanner'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div style={styles.appContainer}>
      {/* GLOBAL HEADER & NAVIGATION */}
      <header style={styles.header}>
        <div style={styles.headerBrand}>
          <ShieldCheck size={26} style={{ color: '#38bdf8', marginRight: 10 }} />
          <div>
            <h1 style={styles.headerTitle}>Engineering Gala Night 2026</h1>
            <p style={styles.headerSubtitle}>Ticket Management & Gate Verification System</p>
          </div>
        </div>

        <div style={styles.navAndUser}>
          {/* TAB NAVIGATION */}
          <nav style={styles.navTabs}>
            <button
              onClick={() => setActiveTab('attendees')}
              style={activeTab === 'attendees' ? styles.activeTabBtn : styles.tabBtn}
            >
              <Users size={16} style={{ marginRight: 6 }} /> Attendee Portal
            </button>
            <button
              onClick={() => setActiveTab('scanner')}
              style={activeTab === 'scanner' ? styles.activeTabBtn : styles.tabBtn}
            >
              <QrCode size={16} style={{ marginRight: 6 }} /> Gate Scanner
            </button>
          </nav>

          <button onClick={handleSignOut} style={styles.logoutBtn} title="Sign Out">
            <LogOut size={16} style={{ marginRight: 4 }} /> Logout
          </button>
        </div>
      </header>

      {/* MAIN VIEW SWITCHER */}
      <main style={styles.mainContent}>
        {activeTab === 'attendees' ? (
          <AttendeeManager currentUser={session.user} />
        ) : (
          <GateScanner currentUser={session.user} />
        )}
      </main>
    </div>
  );
}

const styles = {
  appContainer: {
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '1rem 2rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid #334155',
  },
  headerBrand: {
    display: 'flex',
    alignItems: 'center',
  },
  headerTitle: {
    margin: 0,
    fontSize: '1.25rem',
    color: '#f8fafc',
    fontWeight: 'bold',
  },
  headerSubtitle: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#94a3b8',
  },
  navAndUser: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  navTabs: {
    display: 'flex',
    backgroundColor: '#1e293b',
    padding: '4px',
    borderRadius: '8px',
    border: '1px solid #334155',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 1rem',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    transition: 'all 0.2s',
  },
  activeTabBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 1rem',
    border: 'none',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 0.9rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold',
  },
  mainContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
};