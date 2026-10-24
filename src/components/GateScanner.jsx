import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../supabase';
import { ShieldCheck, AlertTriangle, CheckCircle, RefreshCw, XCircle, Search } from 'lucide-react';

export default function GateScanner({ currentUser }) {
  const [scanResult, setScanResult] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('reader', {
      qrbox: { width: 250, height: 250 },
      fps: 10,
    }, false);

    scanner.render(onScanSuccess, onScanError);
    scannerRef.current = scanner;

    return () => {
      scanner.clear().catch(err => console.error("Failed to clear scanner", err));
    };
  }, []);

  const onScanSuccess = (decodedText) => {
    verifyTicketNumber(decodedText.trim());
  };

  const onScanError = (error) => {
    // Quiet error handling for continuous scanning frame noise
  };

  const verifyTicketNumber = async (ticketNum) => {
    if (!ticketNum || loading) return;
    setLoading(true);

    try {
      // Fetch ticket along with linked attendee details
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
          *,
          attendees (*)
        `)
        .eq('ticket_number', ticketNum)
        .maybeSingle();

      if (error || !ticket) {
        setScanResult({
          status: 'INVALID',
          title: 'INVALID TICKET',
          message: `No ticket found for code: ${ticketNum}`,
        });
        setLoading(false);
        return;
      }

      // Check if ticket was already used
      if (ticket.status === 'USED' || ticket.status === 'CHECKED_IN') {
        setScanResult({
          status: 'WARNING',
          title: 'ALREADY SCANNED!',
          message: `Ticket ${ticket.ticket_number} was already scanned for ${ticket.attendees?.full_name}.`,
          attendee: ticket.attendees,
          scannedAt: ticket.scanned_at,
        });
        setLoading(false);
        return;
      }

      // Valid ticket -> Mark as CHECKED_IN
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'USED',
          scanned_at: now,
          scanned_by: currentUser.id,
        })
        .eq('id', ticket.id);

      if (updateError) {
        setScanResult({
          status: 'INVALID',
          title: 'UPDATE ERROR',
          message: updateError.message,
        });
      } else {
        setScanResult({
          status: 'SUCCESS',
          title: 'ACCESS GRANTED',
          message: `Welcome to Engineering Gala Night 2026!`,
          attendee: ticket.attendees,
          ticketNumber: ticket.ticket_number,
        });
      }
    } catch (err) {
      console.error('Scan verification error:', err);
    }
    setLoading(false);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      verifyTicketNumber(manualCode.trim().toUpperCase());
    }
  };

  const resetScan = () => {
    setScanResult(null);
    setManualCode('');
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.pageTitle}>
        <ShieldCheck size={24} style={{ marginRight: 8, color: '#38bdf8' }} /> Usher Gate Validation Scanner
      </h2>

      {/* VERIFICATION RESULT DISPLAY BANNER */}
      {scanResult && (
        <div style={
          scanResult.status === 'SUCCESS' ? styles.successCard :
          scanResult.status === 'WARNING' ? styles.warningCard : styles.errorCard
        }>
          <div style={styles.resultHeader}>
            {scanResult.status === 'SUCCESS' && <CheckCircle size={40} color="#4ade80" />}
            {scanResult.status === 'WARNING' && <AlertTriangle size={40} color="#facc15" />}
            {scanResult.status === 'INVALID' && <XCircle size={40} color="#f87171" />}
            <div>
              <h3 style={styles.resultTitle}>{scanResult.title}</h3>
              <p style={styles.resultSubtitle}>{scanResult.message}</p>
            </div>
          </div>

          {scanResult.attendee && (
            <div style={styles.attendeeInfoBox}>
              <p><strong>Attendee:</strong> {scanResult.attendee.full_name}</p>
              <p><strong>Phone:</strong> {scanResult.attendee.phone_number}</p>
              {scanResult.ticketNumber && <p><strong>Ticket Number:</strong> {scanResult.ticketNumber}</p>}
            </div>
          )}

          <button onClick={resetScan} style={styles.nextScanBtn}>
            <RefreshCw size={16} style={{ marginRight: 6 }} /> Scan Next Ticket
          </button>
        </div>
      )}

      {/* CAMERA SCANNER BOX */}
      {!scanResult && (
        <div style={styles.card}>
          <p style={styles.instructions}>Point camera at the attendee's ticket QR code:</p>
          <div id="reader" style={styles.scannerViewport}></div>

          {/* MANUAL ENTRY FALLBACK */}
          <div style={styles.divider}>OR ENTER CODE MANUALLY</div>
          <form onSubmit={handleManualSubmit} style={styles.manualForm}>
            <input
              type="text"
              placeholder="e.g. ENG-2026-Y22T-BNBJ"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              <Search size={16} style={{ marginRight: 6 }} /> Verify Code
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { marginTop: '1.5rem', maxWidth: '600px', margin: '1.5rem auto' },
  pageTitle: { color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' },
  card: { backgroundColor: '#1e293b', padding: '1.5rem', borderRadius: '12px', border: '1px solid #334155' },
  instructions: { color: '#94a3b8', textAlign: 'center', marginTop: 0, fontSize: '0.9rem' },
  scannerViewport: { borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' },
  divider: { textAlign: 'center', color: '#64748b', fontSize: '0.75rem', margin: '1.2rem 0', fontWeight: 'bold' },
  manualForm: { display: 'flex', gap: '0.5rem' },
  input: { flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', fontSize: '0.9rem', outline: 'none' },
  submitBtn: { display: 'flex', alignItems: 'center', backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' },
  successCard: { backgroundColor: 'rgba(34, 197, 94, 0.15)', border: '2px solid #22c55e', borderRadius: '12px', padding: '1.5rem', color: '#fff', textAlign: 'center' },
  warningCard: { backgroundColor: 'rgba(234, 179, 8, 0.15)', border: '2px solid #eab308', borderRadius: '12px', padding: '1.5rem', color: '#fff', textAlign: 'center' },
  errorCard: { backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '2px solid #ef4444', borderRadius: '12px', padding: '1.5rem', color: '#fff', textAlign: 'center' },
  resultHeader: { display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', marginBottom: '1rem' },
  resultTitle: { margin: 0, fontSize: '1.4rem', fontWeight: 'bold' },
  resultSubtitle: { margin: '0.2rem 0 0 0', fontSize: '0.9rem', color: '#cbd5e1' },
  attendeeInfoBox: { backgroundColor: '#0f172a', padding: '0.8rem', borderRadius: '8px', textAlign: 'left', margin: '1rem 0', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  nextScanBtn: { display: 'inline-flex', alignItems: 'center', backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem' }
};