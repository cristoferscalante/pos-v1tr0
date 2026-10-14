import type { CSSProperties, ReactNode } from 'react';
import type { LocalSale } from '../types';
import type { ReceiptBusiness } from '../utils/receiptImage';
import { buildTicketLines, COLUMNS, type PaperWidth, type TicketLine } from '../utils/thermalPrinter';

/** El recibo en pantalla, armado con las mismas líneas que se imprimen. */
export function ReceiptPreview({ sale, biz, paper }: { sale: LocalSale; biz: ReceiptBusiness; paper: PaperWidth }) {
  const lines = buildTicketLines(sale, biz, paper);
  const nodes: ReactNode[] = [];
  let box: ReactNode[] | null = null;

  const lineNode = (line: TicketLine, key: number) => (
    <div key={key} className={`rp-line${line.bold ? ' b' : ''}${line.big ? ' big' : ''}${line.invert ? ' inv' : ''}`}>
      {line.big ? <span>{line.text.trimEnd()}</span> : (line.text.trimEnd() || ' ')}
    </div>
  );

  lines.forEach((line, i) => {
    if (line.image) {
      box = null;
      nodes.push(<div key={i} className="rp-logo"><img src={line.image} alt="" onError={e => { e.currentTarget.parentElement!.style.display = 'none'; }} /></div>);
      return;
    }
    if (line.boxed) {
      if (!box) { box = []; nodes.push(<div key={`box-${i}`} className="rp-box">{box}</div>); }
      box.push(lineNode(line, i));
      return;
    }
    box = null;
    nodes.push(lineNode(line, i));
  });

  return (
    <div className="receipt-preview" style={{ '--cols': COLUMNS[paper] } as CSSProperties} aria-label="Vista previa del recibo">
      <div className="receipt-preview-inner">{nodes}</div>
    </div>
  );
}
