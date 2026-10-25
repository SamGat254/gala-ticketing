import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserPlus, Search, CheckCircle, Clock, CreditCard, RefreshCw, Ticket, Trash2 } from 'lucide-react';
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
    let formattedNumber = `ENG-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const { data: ticketNumber } = await supabase.rpc('get_next_ticket_number');
      if (ticketNumber) formattedNumber = ticketNumber;
    } catch (e) {
      console.warn('RPC ticket number fallback used:', e);
    }

    const { error: ticketError } = await supabase
      .from('tickets')
      .insert({
        attendee_id: attendeeId,
        ticket_number: formattedNumber,
        issued_by: currentUser?.id || null,
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
        created_by: currentUser?.id || null,
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

  const handleDeleteAttendee = async (attendeeId, attendeeName) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${attendeeName}? This will remove their record and associated tickets.`
    );
    if (!confirmDelete) return;

    setLoading(true);

    // Delete tickets associated with attendee first
    await supabase.from('tickets').delete().eq('attendee_id', attendeeId);

    // Delete attendee record
    const { error: deleteError } = await supabase
      .from('attendees')
      .delete()
      .eq('id', attendeeId);

    if (deleteError) {
      alert(`Delete failed: ${deleteError.message}`);
    } else {
      setAttendees(attendees.filter((a) => a.id !== attendeeId));
    }

    setLoading(false);
  };

  const openTicketModal = (attendee, ticket) => {
    setSelectedAttendee(attendee);
    setSelectedTicket(ticket);
  };

  const filteredAttendees = attendees.filter((att) => {
    const matchesSearch =
      (att.full_name && att.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (att.phone_number && att.phone_number.includes(searchTerm)) ||
      (att.payment_reference && att.payment_reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (att.tickets && att.tickets.some((t) => t.ticket_number && t.ticket_number.toLowerCase().includes(searchTerm.toLowerCase())));

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
          <UserPlus size={18} style={{ marginRight: 8 }} /> Register New Attendee
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
            <label style={styles.label}>Payment Ref (M-Pesa Code)</label>
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

          <div style={{ gridColumn: '1 / -1', marginTop: '0.25rem' }}>
            <button type="submit" disabled={submitting} style={styles.submitBtn}>
              {submitting ? 'Processing...' : 'Register Attendee'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: EXCEL-STYLE ATTENDEE TABLE */}
      <div style={{ ...styles.card, marginTop: '1rem' }}>
        <div style={styles.tableHeader}>
          <h3 style={styles.cardTitle}>Registered Attendees ({filteredAttendees.length})</h3>

          <div style={styles.controls}>
            <div style={styles.searchWrapper}>
              <Search size={14} style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search name, phone, ticket..."
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
              <option value="ALL">All Payments</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
            </select>

            <button onClick={fetchAttendees} style={styles.refreshBtn} title="Refresh Table">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: '1rem', color: '#64748b', fontSize: '13px' }}>Loading records...</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.excelTable}>
              <thead>
                <tr>
                  <th style={{ width: '35px' }}>#</th>
                  <th style={{ width: '180px' }}>Name & Contact</th>
                  <th style={{ width: '110px' }}>Payment Ref</th>
                  <th style={{ width: '100px' }}>Status</th>
                  <th style={{ width: '110px' }}>Ticket No.</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendees.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
                      No attendees found.
                    </td>
                  </tr>
                ) : (
                  filteredAttendees.map((att, idx) => (
                    <tr key={att.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td style={styles.cellTruncate}>
                        <div style={{ fontWeight: '600', color: '#111827' }}>{att.full_name}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {att.phone_number} {att.email ? `• ${att.email}` : ''}
                        </div>
                      </td>
                      <td style={styles.cellTruncate}>
                        <code style={styles.code}>{att.payment_reference || 'N/A'}</code>
                      </td>
                      <td>
                        {att.payment_status === 'CONFIRMED' ? (
                          <span style={styles.badgeSuccess}>
                            <CheckCircle size={11} style={{ marginRight: 3 }} /> CONFIRMED
                          </span>
                        ) : (
                          <span style={styles.badgePending}>
                            <Clock size={11} style={{ marginRight: 3 }} /> PENDING
                          </span>
                        )}
                      </td>
                      <td>
                        {att.tickets && att.tickets.length > 0 ? (
                          <span style={styles.ticketBadge}>{att.tickets[0].ticket_number}</span>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '11px' }}>No Ticket</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          {att.payment_status === 'PENDING' && (
                            <button
                              onClick={() => handleConfirmPayment(att.id)}
                              style={styles.actionBtn}
                              title="Confirm Payment & Issue Ticket"
                            >
                              <CreditCard size={12} style={{ marginRight: 2 }} /> Confirm
                            </button>
                          )}

                          {att.tickets && att.tickets.length > 0 && (
                            <button
                              onClick={() => openTicketModal(att, att.tickets[0])}
                              style={styles.viewTicketBtn}
                              title="View & Download Ticket"
                            >
                              <Ticket size={12} style={{ marginRight: 2 }} /> Ticket
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteAttendee(att.id, att.full_name)}
                            style={styles.deleteBtn}
                            title="Delete Attendee"
                          >
                            <Trash2 size={12} />
                          </button>
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
  container: { width: '100%', margin: '0 auto', padding: '0' },
  card: {
    backgroundColor: '#ffffff',
    padding: '1rem',
    border: '1px solid #111827',
    borderRadius: '4px',
  },
  cardTitle: {
    margin: 0,
    color: '#111827',
    fontSize: '15px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0.75rem',
    marginTop: '0.75rem',
  },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  label: { fontSize: '12px', fontWeight: '600', color: '#374151' },
  input: {
    padding: '7px 9px',
    borderRadius: '3px',
    border: '1px solid #111827',
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: '13px',
    outline: 'none',
  },
  submitBtn: {
    padding: '9px 16px',
    backgroundColor: '#111827',
    color: '#ffffff',
    border: 'none',
    borderRadius: '3px',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
  },
  tableHeader: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  controls: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: '8px', color: '#6b7280' },
  searchInput: {
    padding: '6px 6px 6px 1.8rem',
    borderRadius: '3px',
    border: '1px solid #111827',
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: '12px',
  },
  filterSelect: {
    padding: '6px',
    borderRadius: '3px',
    border: '1px solid #111827',
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: '12px',
  },
  refreshBtn: {
    padding: '6px 8px',
    borderRadius: '3px',
    border: '1px solid #111827',
    backgroundColor: '#ffffff',
    color: '#111827',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  tableWrapper: { overflowX: 'auto', border: '1px solid #111827' },
  excelTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  cellTruncate: {
    maxWidth: '160px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  code: {
    backgroundColor: '#f3f4f6',
    padding: '2px 4px',
    borderRadius: '2px',
    fontSize: '11px',
    color: '#111827',
    border: '1px solid #e5e7eb',
  },
  badgeSuccess: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderRadius: '2px',
    backgroundColor: '#dcfce7',
    color: '#15803d',
    fontSize: '11px',
    fontWeight: '700',
  },
  badgePending: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderRadius: '2px',
    backgroundColor: '#fef9c3',
    color: '#a16207',
    fontSize: '11px',
    fontWeight: '700',
  },
  ticketBadge: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '2px 6px',
    borderRadius: '2px',
    fontSize: '11px',
    fontWeight: '700',
  },
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '700',
  },
  viewTicketBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '700',
  },
  deleteBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 6px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '11px',
  },
  errorBanner: {
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
    borderRadius: '3px',
    marginBottom: '0.75rem',
    fontSize: '12px',
  },
  successBanner: {
    padding: '8px 12px',
    backgroundColor: '#f0fdf4',
    color: '#15803d',
    border: '1px solid #86efac',
    borderRadius: '3px',
    marginBottom: '0.75rem',
    fontSize: '12px',
  },
};