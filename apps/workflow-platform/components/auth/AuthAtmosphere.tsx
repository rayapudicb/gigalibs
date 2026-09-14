import type { CSSProperties } from 'react';

const PARTICLES = Array.from({ length: 72 }, (_, index) => ({
  angle: (index * 137.508) % 360,
  distance: 82 + ((index * 47) % 310),
  delay: -((index * 0.11) % 5.4),
  duration: 4.8 + ((index * 19) % 28) / 10,
  size: 2 + (index % 4),
  color: index % 9 === 0 ? '#f97316' : index % 5 === 0 ? '#a855f7' : '#2563eb',
}));

export function AuthAtmosphere() {
  return (
    <div className="auth-atmosphere" aria-hidden="true">
      <div className="auth-glow auth-glow-blue" />
      <div className="auth-glow auth-glow-violet" />
      <div className="auth-orbit auth-orbit-one" />
      <div className="auth-orbit auth-orbit-two" />
      <div className="auth-particle-origin">
        {PARTICLES.map((particle) => (
          <span
            key={`${particle.angle}-${particle.distance}`}
            className="auth-particle"
            style={
              {
                '--particle-angle': `${particle.angle}deg`,
                '--particle-distance': `${particle.distance}px`,
                '--particle-delay': `${particle.delay}s`,
                '--particle-duration': `${particle.duration}s`,
                '--particle-size': `${particle.size}px`,
                '--particle-color': particle.color,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
