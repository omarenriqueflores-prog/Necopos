import React from 'react';
import { TicketData, generateTicketHtml } from '../../utils/ticketGenerator';
import { BranchConfig } from '../../types/pos';

interface TicketPreviewProps {
  data: TicketData;
  branch: BranchConfig;
  format: 'TICKET' | 'A4';
  height?: string;
}

export const TicketPreview: React.FC<TicketPreviewProps> = ({
  data,
  branch,
  format,
  height = '450px'
}) => {
  const html = generateTicketHtml(data, branch, format === 'A4' ? 'A4' : 'TICKET');
  
  // Clean up the HTML for preview (remove onload auto-print)
  const previewHtml = html.replace(/onload="[^"]*"/g, '');

  return (
    <div className="w-full bg-[#6c7178] p-2 border border-[#74777f] flex justify-center overflow-hidden">
      <iframe
        title="Ticket Preview"
        srcDoc={previewHtml}
        className="bg-white shadow-lg border border-black"
        style={{
          width: format === 'A4' ? '100%' : '320px',
          height: height,
          maxWidth: format === 'A4' ? '800px' : '320px',
        }}
      />
    </div>
  );
};
