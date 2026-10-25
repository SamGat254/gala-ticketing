import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabase';

export default function GateScanner({ user }) {
  const [ticketIdInput, setTicketIdInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const html5QrcodeRef = useRef(null);

  useEffect(() => {
    return () => {
      stopScannerSilently();
    };
  }, []);

  const stopScannerSilently = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      } finally {
        html5QrcodeRef.current = null;
      }
    }
  };

  const startCameraScanner = async () => {
    setErrorMessage('');
    setScanResult(null);
    setIsScanning(true);

    setTimeout(async () => {
      try {
        await stopScannerSilently();

        const viewportElement = document.getElementById('qr-reader-viewport');
        if (!viewportElement) {
          setIsScanning(false);
          return;
        }

        html5QrcodeRef.current = new Html5Qrcode('qr-reader-viewport');

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        await html5QrcodeRef.current.start(
          { facingMode: 'environment' },
          config,
          onScanSuccess,
          () => {} // Ignore frame parse warnings
        );
      } catch (err) {
        console.error('Camera startup error:', err);
        setErrorMessage('Unable to start back camera. Ensure HTTPS connection & camera permissions.');
        setIsScanning(false);
      }
    }, 200);
  };

  const onScanSuccess = async (decodedText) => {
    await stopScannerSilently();
    setIsScanning(false);
    verifyAndCheckInTicket(decodedText.trim());
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (!ticketIdInput.trim()) return;
    verifyAndCheckInTicket(ticketIdInput.trim());
  };

  const normalizePhoneNumber = (phone) => {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('254')) {
      return '0' + clean.slice(3);
    }
    return clean;
  };

  const verifyAndCheckInTicket = async (queryValue) => {
    setLoading(true);
    setErrorMessage('');
    setScanResult(null);

    try {
      const cleanQuery = queryValue.trim();
      const cleanPhone = normalizePhoneNumber(cleanQuery);

      // Validate strict UUID format to prevent PostgreSQL type errors
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanQuery);

      let ticket = null;

      // STEP 1: Search tickets table by ID (if UUID) or ticket_number
      if (isUUID) {
        const { data: tktByUuid } = await supabase
          .from('tickets')
          .select('*, attendees(*)')
          .eq('id', cleanQuery)
          .maybeSingle();

        ticket = tktByUuid;
      }

      if (!ticket) {
        const { data: tktByNumber } = await supabase
          .from('tickets')
          .select('*, attendees(*)')
          .ilike('ticket_number', cleanQuery)
          .maybeSingle();

        ticket = tktByNumber;
      }

      // STEP 2: Search attendees table by Phone Number or Payment Ref
      // FIX: Query array of attendees instead of .maybeSingle() to handle shared numbers in group passes
      if (!ticket) {
        const { data: attendeesList } = await supabase
          .from('attendees')
          .select('id')
          .or(`phone_number.eq.${cleanQuery},phone_number.eq.${cleanPhone},payment_reference.ilike.${cleanQuery}`)
          .order('created_at', { ascending: false });

        if (attendeesList && attendeesList.length > 0) {
          const attendeeIds = attendeesList.map((a) => a.id);

          // Retrieve all tickets associated with these attendees
          const { data: linkedTickets } = await supabase
            .from('tickets')
            .select('*, attendees(*)')
            .in('attendee_id', attendeeIds)
            .order('status', { ascending: false }); // Prioritizes VALID tickets over USED

          if (linkedTickets && linkedTickets.length > 0) {
            ticket = linkedTickets[0];
          }
        }
      }

      if (!ticket) {
        setScanResult({
          status: 'INVALID',
          title: 'ACCESS DENIED',
          message: 'INVALID TICKET - Not found in database'
        });
        setLoading(false);
        return;
      }

      if (ticket.status === 'USED') {
        setScanResult({
          status: 'ALREADY_USED',
          title: 'WARNING - ALREADY CHECKED IN',
          message: `Ticket was scanned at ${ticket.scanned_at ? new Date(ticket.scanned_at).toLocaleTimeString() : 'earlier'}`,
          ticket
        });
        setLoading(false);
        return;
      }

      // STEP 3: Update ticket to USED status
      const { data: updated, error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'USED',
          scanned_at: new Date().toISOString(),
          scanned_by: user?.id || null
        })
        .eq('id', ticket.id)
        .select('*, attendees(*)')
        .single();

      if (updateError) throw updateError;

      const attendeeName = updated?.attendees?.full_name || 'VIP Guest';
      const groupAllNames = updated?.attendees?.group_all_names;
      const ticketType = updated?.attendees?.ticket_type || 'Single Pass';

      setScanResult({
        status: 'SUCCESS',
        title: '✨ ENTRY GRANTED ✨',
        welcomeHeadline: `Welcome to the Engineering Gala Night, ${attendeeName}! 🎉`,
        subtext: 'We are thrilled to have you here tonight. Enjoy the celebration!',
        ticketType,
        groupAllNames,
        ticket: updated
      });
    } catch (err) {
      console.error('Verification error:', err);
      setErrorMessage(err.message || 'Error processing ticket verification.');
    } finally {
      setLoading(false);
    }
  };

  const resetForNextScan = async () => {
    setScanResult(null);
    setTicketIdInput('');
    setErrorMessage('');
    startCameraScanner();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>ENGINEERING GALA NIGHT GATE SCANNER</h2>

      {/* Manual Verification Form */}
      <form onSubmit={handleManualSearch} style={styles.manualForm}>
        <input
          type="text"
          placeholder="Enter Ticket No, Payment Ref, or Phone..."
          value={ticketIdInput}
          onChange={(e) => setTicketIdInput(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.verifyBtn}>
          {loading ? 'Checking...' : 'Verify'}
        </button>
      </form>

      {/* Scanner Viewport Container */}
      {!scanResult && (
        <div style={styles.scannerBox}>
          <div id="qr-reader-viewport" style={styles.viewport}></div>
          {!isScanning && (
            <button onClick={startCameraScanner} style={styles.startCamBtn}>
              📷 Open Rear Camera Scanner
            </button>
          )}
        </div>
      )}

      {errorMessage && <div style={styles.errorAlert}>{errorMessage}</div>}

      {/* Result Welcome Card */}
      {scanResult && (
        <div style={{
          ...styles.resultCard,
          borderColor: scanResult.status === 'SUCCESS' ? '#16a34a' : scanResult.status === 'ALREADY_USED' ? '#d97706' : '#dc2626',
          backgroundColor: scanResult.status === 'SUCCESS' ? '#f0fdf4' : scanResult.status === 'ALREADY_USED' ? '#fffbeb' : '#fef2f2'
        }}>
          <div style={styles.badgeIcon}>
            {scanResult.status === 'SUCCESS' ? '🥂' : scanResult.status === 'ALREADY_USED' ? '⚠️' : '⛔'}
          </div>

          <h3 style={{
            color: scanResult.status === 'SUCCESS' ? '#15803d' : scanResult.status === 'ALREADY_USED' ? '#b45309' : '#b91c1c',
            fontSize: '20px',
            fontWeight: '800',
            margin: '0 0 8px 0'
          }}>
            {scanResult.title}
          </h3>

          {scanResult.status === 'SUCCESS' && (
            <div style={styles.welcomeBox}>
              <p style={styles.welcomeText}>{scanResult.welcomeHeadline}</p>
              <p style={styles.welcomeSubtext}>{scanResult.subtext}</p>
              {scanResult.groupAllNames && (
                <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#dcfce7', borderRadius: '6px', fontSize: '12px', color: '#166534' }}>
                  <strong>Package Group Members:</strong> {scanResult.groupAllNames}
                </div>
              )}
            </div>
          )}

          {scanResult.status !== 'SUCCESS' && (
            <p style={{ color: '#374151', fontSize: '14px', fontWeight: '600', margin: '8px 0' }}>
              {scanResult.message}
            </p>
          )}

          {scanResult.ticket && (
            <div style={styles.ticketDetails}>
              <p><strong>Attendee Name:</strong> {scanResult.ticket.attendees?.full_name || 'N/A'}</p>
              <p><strong>Package:</strong> {scanResult.ticket.attendees?.ticket_type || 'Single Pass'}</p>
              <p><strong>Phone Number:</strong> {scanResult.ticket.attendees?.phone_number || 'N/A'}</p>
              <p><strong>Payment Ref:</strong> {scanResult.ticket.attendees?.payment_reference || 'N/A'}</p>
              <p><strong>Ticket Number:</strong> {scanResult.ticket.ticket_number}</p>
              <p><strong>Check-in Time:</strong> {new Date(scanResult.ticket.scanned_at || Date.now()).toLocaleTimeString()}</p>
            </div>
          )}

          <button onClick={resetForNextScan} style={styles.nextScanBtn}>
            🔄 Scan Next Guest
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '12px',
    maxWidth: '550px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  heading: {
    fontSize: '18px',
    fontWeight: '800',
    textAlign: 'center',
    margin: '0 0 14px 0',
    color: '#111827',
    letterSpacing: '0.5px'
  },
  manualForm: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  input: {
    flex: '1',
    padding: '12px',
    fontSize: '14px',
    border: '1.5px solid #111827',
    borderRadius: '6px',
    outline: 'none'
  },
  verifyBtn: {
    padding: '12px 18px',
    fontSize: '14px',
    fontWeight: '700',
    backgroundColor: '#111827',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  scannerBox: {
    border: '1.5px solid #111827',
    borderRadius: '8px',
    padding: '10px',
    textAlign: 'center',
    backgroundColor: '#ffffff'
  },
  viewport: {
    width: '100%',
    minHeight: '260px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px'
  },
  startCamBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '700',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '8px'
  },
  resultCard: {
    marginTop: '16px',
    padding: '20px',
    border: '2.5px solid',
    borderRadius: '10px',
    textAlign: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
  },
  badgeIcon: {
    fontSize: '36px',
    marginBottom: '6px'
  },
  welcomeBox: {
    margin: '12px 0 16px 0',
    padding: '12px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #bbf7d0'
  },
  welcomeText: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#14532d',
    margin: '0 0 6px 0'
  },
  welcomeSubtext: {
    fontSize: '13px',
    color: '#166534',
    margin: 0
  },
  ticketDetails: {
    textAlign: 'left',
    fontSize: '14px',
    margin: '12px 0',
    padding: '12px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    lineHeight: '1.6'
  },
  nextScanBtn: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    fontWeight: '800',
    backgroundColor: '#111827',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '8px'
  },
  errorAlert: {
    padding: '12px',
    marginTop: '12px',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'center'
  }
};