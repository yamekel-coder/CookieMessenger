import { useState, useEffect, useRef } from 'react';

const TARGET_DATE = new Date('2026-05-01T00:00:00');

function useCountdown(target) {
  const [time, setTime] = useState({});
  useEffect(() => {
    const calc = () => {
      const diff = target - Date.now();
      if (diff <= 0) return setTime({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      setTime({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [target]);
  return time;
}

function Glitch({ text }) {
  return (
    <span className="event-glitch" data-text={text}>{text}</span>
  );
}

export default function Event() {
  const { days, hours, minutes, seconds } = useCountdown(TARGET_DATE);
  const [revealed, setRevealed] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [particles, setParticles] = useState([]);
  const canvasRef = useRef();

  // Easter egg — click logo 5 times
  const handleLogoClick = () => {
    const next = clicks + 1;
    setClicks(next);
    if (next >= 5) { setRevealed(true); setClicks(0); }
  };

  // Particle effect on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      o: Math.random() * 0.5 + 0.1,
    }));

    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.o})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const pad = n => String(n ?? 0).padStart(2, '0');

  return (
    <div className="event-page">
      <canvas ref={canvasRef} className="event-canvas" />

      <div className="event-content">
        {/* Logo */}
        <div className="event-logo" onClick={handleLogoClick}>
          <span className="event-logo-icon">⬡</span>
        </div>

        {/* Title */}
        <div className="event-eyebrow">СКОРО · СЕКРЕТНО</div>
        <h1 className="event-title">
          <Glitch text="???" />
        </h1>
        <p className="event-subtitle">
          Что-то большое готовится.<br />
          Следи за обновлениями.
        </p>

        {/* Countdown */}
        <div className="event-countdown">
          {[['дней', days], ['часов', hours], ['минут', minutes], ['секунд', seconds]].map(([label, val]) => (
            <div key={label} className="event-unit">
              <span className="event-num">{pad(val)}</span>
              <span className="event-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Redacted hint */}
        <div className="event-hint">
          <span className="event-redacted">████████████████</span>
          <span className="event-redacted">██████ ████ ███</span>
          <span className="event-redacted">████████████</span>
        </div>

        {/* Easter egg reveal */}
        {revealed && (
          <div className="event-reveal">
            <div className="event-reveal-inner">
              <span>🎉</span>
              <p>Ты нашёл секрет!</p>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Скоро всё узнаешь...</span>
            </div>
          </div>
        )}

        <p className="event-footer">RLC · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
