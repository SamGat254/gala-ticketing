import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabase';

export default function GateScanner({ currentUser }) {
  const [searchInput, setSearchInput] = useState('');
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
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.error('Error stopping camera scanner:', err);
      }
    }
  };

  const startCamera = async () => {
    setErrorMessage('');
    setScanResult(null);
    setIsScanning(true);

    setTimeout(async () => {
      try {
        if (!html5QrcodeRef.current) {
          html5QrcodeRef.current = new Html5Qrcode('qr-reader-viewport');
        }

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        await html5QrcodeRef.current.start(
          { facingMode: 'environment' },
          config,
          onScanSuccess,
          () => {} // Ignore frame-by-frame parse warnings
        );
      } catch (err) {
        console.error('Camera startup error:', err);
        setErrorMessage('Unable to access rear camera. Ensure HTTPS and camera permissions are allowed.');
        setIsScanning(false);
      }
    }, 200);
  };

  const onScanSuccess = async (decodedText) => {
    await stopScannerSilently();
    setIsScanning(false);
    verifyAndCheckIn(decodedText.trim());
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    verifyAndCheckIn(searchInput.trim());
  };

  const verifyAndCheckIn = async (queryValue) => {
    setLoading(true);
    setErrorMessage('');
    setScanResult(null);

    try {
      const cleanQuery = queryValue.trim();

      // Check if string matches UUID format (8-4-4-4-12 hex characters)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanQuery);

      // Step 1: Query tickets table safely
      let query = supabase.from('tickets').select('*, attendees(*)');

      if (isUUID) {
        // Safe to check primary key `id` alongside `ticket_number`
        query = query.or(`ticket_number.eq.${cleanQuery},id.eq.${cleanQuery}`);
      } else {
        // Search strictly by text column `ticket_number` to prevent UUID syntax crash
        query = query.eq('ticket_number', cleanQuery);
      }

      let { data: ticket, error: tktError } = await query.maybeSingle();

      if (tktError) throw tktError;

      // Step 2: If not found by ticket number/ID, search attendee by phone_number
      if (!ticket) {
        const { data: attendee, error: attError } = await supabase
          .from('attendees')
          .select('id')
          .eq('phone_number', cleanQuery)
          .maybeSingle();

        if (attError) throw attError;

        if (attendee) {
          const { data: linkedTicket } = await supabase
            .from('tickets')
            .select('*, attendees(*)')
            .eq('attendee_id', attendee.id)
            .maybeSingle();

          ticket = linkedTicket;
        }
      }

      if (!ticket) {
        setScanResult({
          status: 'INVALID',
          message: 'INVALID TICKET - No attendee or ticket matches this ID / Phone'
        });
        setLoading(false);
        return;
      }

      if (ticket.status === 'USED') {
        setScanResult({
          status: 'ALREADY_USED',
          message: `ALREADY USED at ${ticket.scanned_at ? new Date(ticket.scanned_at).toLocaleTimeString() : 'earlier'}`,
          ticket
        });
        setLoading(false);
        return;
      }

      // Step 3: Mark ticket as USED
      const { data: updated, error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'USED',
          scanned_at: new Date().toISOString(),
          scanned_by: currentUser?.email || 'Gate Usher'
        })
        .eq('id', ticket.id)
        .select('*, attendees(*)')
        .single();

      if (updateError) throw updateError;

      setScanResult({
        status: 'SUCCESS',
        message: 'VALID TICKET - ENTRY GRANTED',
        ticket: updated
      });
    } catch (err) {
      console.error('Verification error:', err);
      setErrorMessage(err.message || 'Error processing ticket verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleNextScan = async () => {
    setScanResult(null);
    setSearchInput('');
    setErrorMessage('');
    startCamera();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>GATE TICKET VALIDATION SCANNER</h2>

      {/* Manual Verification Form */}
      <form onSubmit={handleManualSearch} style={styles.manualForm}>
        <input
          type="text"
          placeholder="Enter Ticket Number, ID, or Phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.verifyBtn}>
          {loading ? 'Checking...' : 'Verify'}
        </button>
      </form>

      {/* Camera Viewport */}
      {!scanResult && (
        <div style={styles.scannerBox}>
          <div id="qr-reader-viewport" style={styles.viewport}></div>
          {!isScanning && (
            <button onClick={startCamera} style={styles.startCamBtn}>
              📷 Open Rear Camera
            </button>
          )}
        </div>
      )}

      {errorMessage && <div style={styles.errorAlert}>{errorMessage}</div>}

      {/* Result Card */}
      {scanResult && (
        <div style={{
          ...styles.resultCard,
          borderColor: scanResult.status === 'SUCCESS' ? '#16a34a' : '#dc2626',
          backgroundColor: scanResult.status === 'SUCCESS' ? '#f0fdf4' : '#fef2f2'
        }}>
          <h3 style={{
            color: scanResult.status === 'SUCCESS' ? '#15803d' : '#b91c1c',
            fontSize: '18px',
            margin: '0 0 8px 0'
          }}>
            {scanResult.message}
          </h3>

          {scanResult.ticket && (
            <div style={styles.ticketDetails}>
              <p><strong>Name:</strong> {scanResult.ticket.attendees?.full_name || 'N/A'}</p>
              <p><strong>Phone:</strong> {scanResult.ticket.attendees?.phone_number || 'N/A'}</p>
              <p><strong>Ticket No:</strong> {scanResult.ticket.ticket_number}</p>
            </div>
          )}

          <button onClick={handleNextScan} style={styles.nextScanBtn}>
            🔄 Scan Next Ticket
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '12px', maxWidth: '600px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  heading: { fontSize: '18px', fontWeight: '700', textAlign: 'center', marginBottom: '12px', color: '#111827' },
  manualForm: { display: 'flex', gap: '8px', marginBottom: '16px' },
  input: { flex: '1', padding: '10px', fontSize: '14px', border: '1px solid #111827', borderRadius: '4px' },
  verifyBtn: { padding: '10px 16px', fontSize: '14px', fontWeight: '600', backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  scannerBox: { border: '1px solid #111827', borderRadius: '4px', padding: '8px', textAlign: 'center', backgroundColor: '#ffffff' },
  viewport: { width: '100%', minHeight: '260px', backgroundColor: '#f9fafb' },
  startCamBtn: { width: '100%', padding: '12px', fontSize: '15px', fontWeight: '600', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '8px' },
  resultCard: { marginTop: '16px', padding: '16px', border: '2px solid', borderRadius: '4px', textAlign: 'center' },
  ticketDetails: { textAlign: 'left', fontSize: '14px', margin: '12px 0', padding: '8px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '4px' },
  nextScanBtn: { width: '100%', padding: '12px', fontSize: '15px', fontWeight: '700', backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  errorAlert: { padding: '10px', marginTop: '12px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '13px' }
};