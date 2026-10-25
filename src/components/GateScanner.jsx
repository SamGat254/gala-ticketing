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
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const startCameraScanner = async () => {
    setErrorMessage('');
    setScanResult(null);
    setIsScanning(true);

    setTimeout(async () => {
      try {
        if (!html5QrcodeRef.current) {
          html5QrcodeRef.current = new Html5Qrcode('qr-reader-viewport');
        }

        // Auto-select main rear camera & set high FPS for snappy detection
        const config = { fps: 20, qrbox: { width: 250, height: 250 } };
        
        await html5QrcodeRef.current.start(
          { facingMode: 'environment' },
          config,
          onScanSuccess,
          onScanError
        );
      } catch (err) {
        console.error('Camera startup error:', err);
        setErrorMessage('Unable to start back camera. Ensure HTTPS connection & camera permissions.');
        setIsScanning(false);
      }
    }, 100);
  };

  const onScanSuccess = async (decodedText) => {
    await stopScannerSilently();
    setIsScanning(false);
    verifyAndCheckInTicket(decodedText.trim());
  };

  const onScanError = (error) => {
    // Ignore minor frame read failures for speed
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (!ticketIdInput.trim()) return;
    verifyAndCheckInTicket(ticketIdInput.trim());
  };

  const verifyAndCheckInTicket = async (queryValue) => {
    setLoading(true);
    setErrorMessage('');
    setScanResult(null);

    try {
      // Dual verification: Search by ticket ID or Phone Number / Reg Number
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .or(`id.eq.${queryValue},phone.eq.${queryValue},reg_number.eq.${queryValue}`)
        .limit(1);

      if (error) throw error;

      if (!tickets || tickets.length === 0) {
        setScanResult({
          status: 'INVALID',
          message: 'INVALID TICKET - Not found in database'
        });
        setLoading(false);
        return;
      }

      const ticket = tickets[0];

      if (ticket.status === 'USED') {
        setScanResult({
          status: 'ALREADY_USED',
          message: `ALREADY USED on ${ticket.scanned_at ? new Date(ticket.scanned_at).toLocaleTimeString() : 'earlier'}`,
          ticket
        });
        setLoading(false);
        return;
      }

      // Update to USED status
      const { data: updated, error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'USED',
          scanned_at: new Date().toISOString(),
          scanned_by: user?.email || 'Usher Gate'
        })
        .eq('id', ticket.id)
        .select()
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

  const resetForNextScan = async () => {
    setScanResult(null);
    setTicketIdInput('');
    setErrorMessage('');
    startCameraScanner();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>USHER GATE VALIDATION SCANNER</h2>

      {/* Manual Verification by Ticket ID / Phone Number */}
      <form onSubmit={handleManualSearch} style={styles.manualForm}>
        <input
          type="text"
          placeholder="Enter Ticket ID, Phone, or Reg No..."
          value={ticketIdInput}
          onChange={(e) => setTicketIdInput(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.verifyBtn}>
          {loading ? 'Verifying...' : 'Verify Number'}
        </button>
      </form>

      {/* Scanner Viewport */}
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

      {/* Result Cards */}
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
              <p><strong>Name:</strong> {scanResult.ticket.name}</p>
              <p><strong>Category:</strong> {scanResult.ticket.category || 'Standard'}</p>
              <p><strong>Ticket ID:</strong> {scanResult.ticket.id}</p>
            </div>
          )}

          <button onClick={resetForNextScan} style={styles.nextScanBtn}>
            🔄 Scan Next Ticket
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '12px',
    maxWidth: '600px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  heading: {
    fontSize: '18px',
    fontWeight: '700',
    textAlign: 'center',
    margin: '0 0 12px 0',
    color: '#111827'
  },
  manualForm: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  input: {
    flex: '1',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #111827',
    borderRadius: '4px',
    outline: 'none'
  },
  verifyBtn: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#111827',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  scannerBox: {
    border: '1px solid #111827',
    borderRadius: '4px',
    padding: '8px',
    textAlign: 'center',
    backgroundColor: '#ffffff'
  },
  viewport: {
    width: '100%',
    minHeight: '260px',
    backgroundColor: '#f9fafb'
  },
  startCamBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginTop: '8px'
  },
  resultCard: {
    marginTop: '16px',
    padding: '16px',
    border: '2px solid',
    borderRadius: '4px',
    textAlign: 'center'
  },
  ticketDetails: {
    textAlign: 'left',
    fontSize: '14px',
    margin: '12px 0',
    padding: '8px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '4px'
  },
  nextScanBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '700',
    backgroundColor: '#111827',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  errorAlert: {
    padding: '10px',
    marginTop: '12px',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
    borderRadius: '4px',
    fontSize: '13px'
  }
};