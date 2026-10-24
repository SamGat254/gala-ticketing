import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserPlus, Search, CheckCircle, Clock, CreditCard, RefreshCw, Ticket } from 'lucide-react';
import TicketModal from './TicketModal';

export default function AttendeeManager({ currentUser }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modal state for active ticket preview & download
  const [selectedAttendee, setSelectedAttendee] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('PENDING');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchAttendees();
  }, []);

  const fetchAttendees = async () => {
    setLoading(true);

    const { data: attendeesData, error: attError } = await supabase
      .from('attendees')
      .select('*')
      .order('created_at', { ascending: false });

    if (attError) {
      console.error('Error fetching attendees:', attError.message);
      setLoading(false);
      return;
    }

    const { data: ticketsData, error: tktError } = await supabase
      .from('tickets')
      .select('*');

    if (tktError) {
      console.error('Error fetching tickets:', tktError.message);
    }

    const mergedData = (attendeesData || []).map((att) => {
      const attTickets = (ticketsData || []).filter((t) => t.attendee_id === att.id);
      return { ...att, tickets: attTickets };
    });

    setAttendees(mergedData);
    setLoading(false);
  };

  const generateTicketForAttendee = async (attendeeId) => {
    const { data: ticketNumber } = await supabase.rpc('get_next_ticket_number');
    const formattedNumber = ticketNumber || `ENG-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const { error: ticketError } = await supabase
      .from('tickets')
      .insert({
        attendee_id: attendeeId,
        ticket_number: formattedNumber,
        issued_by: currentUser.id,
        status: 'VALID',
      });

    if (ticketError) {
      console.error('Ticket Insert Error:', ticketError.message);
    }
  };

  const handleRegisterAttendee = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const { data: attendee, error: attendeeError } = await supabase
      .from('attendees')
      .insert({
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim(),
        email: email.trim() || null,
        payment_reference: paymentReference.trim() || null,
        payment_status: paymentStatus,
        payment_confirmed_at: paymentStatus === 'CONFIRMED' ? new Date().toISOString() : null,
        created_by: currentUser.id,
      })
      .select()
      .single();

    if (attendeeError) {
      setMessage({ type: 'error', text: attendeeError.message });
      setSubmitting(false);
      return;
    }

    if (paymentStatus === 'CONFIRMED') {
      await generateTicketForAttendee(attendee.id);
    }

    setMessage({ type: 'success', text: `Attendee ${fullName} registered successfully!` });
    setFullName('');
    setPhoneNumber('');
    setEmail('');
    setPaymentReference('');
    setPaymentStatus('PENDING');
    setSubmitting(false);
    await fetchAttendees();
  };

  const handleConfirmPayment = async (attendeeId) => {
    setLoading(true);

    const { error: updateError } = await supabase
      .from('attendees')
      .update({
        payment_status: 'CONFIRMED',
        payment_confirmed_at: new Date().toISOString(),
      })
      .eq('id', attendeeId);

    if (!updateError) {
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('attendee_id', attendeeId)
        .maybeSingle();

      if (!existingTicket) {
        await generateTicketForAttendee(attendeeId);
      }
    }

    await fetchAttendees();
  };

  const openTicketModal = (attendee, ticket) => {
    setSelectedAttendee(attendee);
    setSelectedTicket(ticket);
  };

  const filteredAttendees = attendees.filter((att) => {
    const matchesSearch =
      att.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      att.phone_number.includes(searchTerm) ||
      (att.payment_reference && att.payment_reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (att.tickets && att.tickets.some((t) => t.ticket_number.toLowerCase().includes(searchTerm.toLowerCase())));

    if (filterStatus === 'ALL') return matchesSearch;
    return matchesSearch && att.payment_status === filterStatus;
  });

  return (
    <div style={styles.container}>
      {/* TICKET PREVIEW MODAL */}
      {selectedAttendee && selectedTicket && (
        <TicketModal
          attendee={selectedAttendee}
          ticket={selectedTicket}
          onClose={() => {
            setSelectedAttendee(null);
            setSelectedTicket(null);
          }}
        />
      )}

      {/* SECTION 1: ATTENDEE REGISTRATION FORM */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>
          <UserPlus size={20} style={{ marginRight: 8 }} /> Register New Attendee
        </h3>

        {message && (
          <div style={message.type === 'error' ? styles.errorBanner : styles.successBanner}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleRegisterAttendee} style={styles.formGrid}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Phone Number *</label>
            <input
              type="text"
              required
              placeholder="e.g. 0712345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address (Optional)</label>
            <input
              type="email"
              placeholder="e.g. jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Payment Reference (M-Pesa Code / Receipt)</label>
            <input
              type="text"
              placeholder="e.g. QX789JKL01"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Payment Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              style={styles.input}
            >
              <option value="PENDING">PENDING (Unpaid / Unverified)</option>
              <option value="CONFIRMED">CONFIRMED (Generate Ticket Now)</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
            <button type="submit" disabled={submitting} style={styles.submitBtn}>
              {submitting ? 'Processing...' : 'Register Attendee'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: ATTENDEE TABLE */}
      <div style={{ ...styles.card, marginTop: '2rem' }}>
        <div style={styles.tableHeader}>
          <h3 style={styles.cardTitle}>Registered Attendees ({filteredAttendees.length})</h3>

          <div style={styles.controls}>
            <div style={styles.searchWrapper}>
              <Search size={16} style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search name, phone, ticket ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="CONFIRMED">Confirmed Only</option>
              <option value="PENDING">Pending Only</option>
            </select>

            <button onClick={fetchAttendees} style={styles.refreshBtn} title="Refresh Table">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: '1rem', color: '#94a3b8' }}>Loading records...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name & Contact</th>
                  <th style={styles.th}>Payment Reference</th>
                  <th style={styles.th}>Payment Status</th>
                  <th style={styles.th}>Ticket Number</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendees.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>
                      No attendees found.
                    </td>
                  </tr>
                ) : (
                  filteredAttendees.map((att) => (
                    <tr key={att.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>{att.full_name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {att.phone_number} {att.email ? `• ${att.email}` : ''}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <code style={styles.code}>{att.payment_reference || 'N/A'}</code>
                      </td>
                      <td style={styles.td}>
                        {att.payment_status === 'CONFIRMED' ? (
                          <span style={styles.badgeSuccess}>
                            <CheckCircle size={12} style={{ marginRight: 4 }} /> CONFIRMED
                          </span>
                        ) : (
                          <span style={styles.badgePending}>
                            <Clock size={12} style={{ marginRight: 4 }} /> PENDING
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {att.tickets && att.tickets.length > 0 ? (
                          <span style={styles.ticketBadge}>{att.tickets[0].ticket_number}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No Ticket</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {att.payment_status === 'PENDING' && (
                            <button
                              onClick={() => handleConfirmPayment(att.id)}
                              style={styles.actionBtn}
                            >
                              <CreditCard size={14} style={{ marginRight: 4 }} /> Confirm Payment
                            </button>
                          )}

                          {att.tickets && att.tickets.length > 0 && (
                            <button
                              onClick={() => openTicketModal(att, att.tickets[0])}
                              style={styles.viewTicketBtn}
                              title="View & Download Digital Ticket"
                            >
                              <Ticket size={14} style={{ marginRight: 4 }} /> View Ticket
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { marginTop: '1.5rem' },
  card: { backgroundColor: '#1e293b', padding: '1.5rem', borderRadius: '10px' },
  cardTitle: { margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.85rem', color: '#cbd5e1' },
  input: {
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#fff',
    fontSize: '0.9rem',
    outline: 'none',
  },
  submitBtn: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' },
  controls: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: '10px', color: '#64748b' },
  searchInput: {
    padding: '0.5rem 0.5rem 0.5rem 2.2rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#fff',
    fontSize: '0.85rem',
  },
  filterSelect: { padding: '0.5rem', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', fontSize: '0.85rem' },
  refreshBtn: { padding: '0.5rem', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#cbd5e1', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' },
  th: { textAlign: 'left', padding: '0.75rem', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem' },
  td: { padding: '0.75rem', borderBottom: '1px solid #334155', fontSize: '0.9rem' },
  tr: { borderBottom: '1px solid #334155' },
  code: { backgroundColor: '#0f172a', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', color: '#fbbf24' },
  badgeSuccess: { display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontSize: '0.8rem', fontWeight: 'bold' },
  badgePending: { display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#facc15', fontSize: '0.8rem', fontWeight: 'bold' },
  ticketBadge: { backgroundColor: '#0284c7', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' },
  actionBtn: { display: 'inline-flex', alignItems: 'center', padding: '0.4rem 0.75rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' },
  viewTicketBtn: { display: 'inline-flex', alignItems: 'center', padding: '0.4rem 0.75rem', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' },
  errorBanner: { padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' },
  successBanner: { padding: '0.75rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' },
};