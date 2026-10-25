import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { X, Download, ShieldCheck } from 'lucide-react';

export default function TicketModal({ attendee, ticket, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!attendee || !ticket || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = '/ticket-template.png';

    img.onload = () => {
      // 1. Set canvas to match the native resolution of your template
      canvas.width = 1672;
      canvas.height = 941;

      // 2. Draw template image directly
      ctx.drawImage(img, 0, 0, 1672, 941);

      // 3. Draw Badge Tier Text if available (Top/Header Badge area)
      const badgeText = attendee.badge_type || attendee.ticket_type || 'CLASSY PASS';
      ctx.fillStyle = '#f59e0b'; // Gold accent color for badge
      ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(badgeText.toUpperCase(), 215, 520);

      // 4. Draw Attendee Name inside upper white box (X: 187, Y: 593, W: 990, H: 71)
      const nameToDisplay = attendee.full_name || attendee.name || 'GALA GUEST';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(nameToDisplay.toUpperCase(), 215, 630);

      // 5. Draw Ticket Number inside lower white box (X: 187, Y: 716, W: 990, H: 71)
      const ticketNum = ticket.ticket_number || ticket.ticket_code || 'GALA-2026-0000';
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(ticketNum, 215, 752);

      // 6. Generate and draw QR code inside right QR box (X: 1253, Y: 546, W: 260, H: 240)
      const tempQrCanvas = document.createElement('canvas');
      QRCode.toCanvas(
        tempQrCanvas,
        ticketNum,
        {
          width: 220,
          margin: 0,
          color: { dark: '#000000', light: '#ffffff' },
        },
        () => {
          // Center QR code inside the box
          ctx.drawImage(tempQrCanvas, 1273, 556, 220, 220);
        }
      );
    };
  }, [attendee, ticket]);

  const handleDownloadPDF = () => {
    if (!canvasRef.current) return;

    // Standard ticket size: 140mm x 78.8mm
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [140, 78.8],
    });

    const attendeeName = attendee.full_name || attendee.name || 'Guest';
    const canvasDataUrl = canvasRef.current.toDataURL('image/png', 1.0);
    doc.addImage(canvasDataUrl, 'PNG', 0, 0, 140, 78.8);
    doc.save(`Gala_Ticket_${attendeeName.replace(/\s+/g, '_')}.pdf`);
  };

  if (!attendee || !ticket) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>
            <ShieldCheck size={20} style={{ marginRight: 8, color: '#4ade80' }} /> Verified Ticket Preview
          </h3>
          <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
        </div>

        {/* CANVAS CARD PREVIEW */}
        <div style={styles.canvasContainer}>
          <canvas ref={canvasRef} style={styles.canvas} />
        </div>

        {/* Package & Group Details */}
        <div style={styles.ticketMeta}>
          <div>
            <span style={{ color: '#94a3b8', fontSize: '11px' }}>TICKET PACKAGE</span>
            <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', fontSize: '13px', color: '#e2e8f0' }}>
              {attendee.ticket_type || 'Single Pass'}
            </p>
          </div>
          {attendee.group_all_names && (
            <div>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>GROUP MEMBERS</span>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>
                {attendee.group_all_names}
              </p>
            </div>
          )}
        </div>

        <div style={styles.modalFooter}>
          <button onClick={handleDownloadPDF} style={styles.downloadBtn}>
            <Download size={16} style={{ marginRight: 6 }} /> Download PDF Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', maxWidth: '580px', width: '90%', color: '#fff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  modalTitle: { margin: 0, fontSize: '1rem', color: '#38bdf8', display: 'flex', alignItems: 'center' },
  closeBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' },
  canvasContainer: { width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', backgroundColor: '#0f172a' },
  canvas: { width: '100%', height: 'auto', display: 'block' },
  ticketMeta: { marginTop: '0.75rem', padding: '8px 12px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '6px' },
  modalFooter: { marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' },
  downloadBtn: { display: 'flex', alignItems: 'center', backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '0.65rem 1.1rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' },
};