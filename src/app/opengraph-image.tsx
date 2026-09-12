import { ImageResponse } from 'next/og';

/**
 * The card that appears when somebody shares a link on WhatsApp or Facebook —
 * which, in this market, is how most links travel.
 *
 * Generated at build time from the brand tokens rather than shipped as a PNG,
 * so the wordmark and colours cannot drift away from the site itself. No
 * network fonts: a font fetch that fails at build time produces a card with
 * fallback metrics and nobody notices until it is public.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Islamabad Fix — Problem batao. Baqi hum sambhal lenge.';

// brand-700 and ink-950 from tailwind.config.ts.
const BRAND = '#0b6b51';
const INK = '#0b0f0e';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        padding: 72,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            backgroundColor: BRAND,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="42" height="42" viewBox="0 0 24 24" fill="#ffffff">
            <path d="M12 1.8 4.4 4.7v6.6c0 4.6 3.1 8.4 7.6 9.5 4.5-1.1 7.6-4.9 7.6-9.5V4.7L12 1.8Zm4.1 5.4a3.4 3.4 0 0 1-4.4 4.4l-2.9 2.9a1.2 1.2 0 0 1-1.7-1.7l2.9-2.9a3.4 3.4 0 0 1 4.4-4.4l-1.9 1.9 1.7 1.7 1.9-1.9Z" />
          </svg>
        </div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: INK }}>
          <span>Islamabad</span>
          <span style={{ color: BRAND }}>Fix</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 76, fontWeight: 700, color: INK, lineHeight: 1.1 }}>
          Problem batao.
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, color: BRAND, lineHeight: 1.1 }}>
          Baqi hum sambhal lenge.
        </div>
        <div style={{ marginTop: 28, fontSize: 30, color: '#4a5553' }}>
          Islamabad mein verified technicians — AC, electrical, plumbing aur bohat kuch.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 14,
          fontSize: 24,
          color: '#4a5553',
          borderTop: '2px solid #eef0f1',
          paddingTop: 24,
        }}
      >
        <span>Transparent quotes</span>
        <span>·</span>
        <span>Qeemat pehle, kaam baad mein</span>
        <span>·</span>
        <span>Fix Guarantee</span>
      </div>
    </div>,
    size,
  );
}
