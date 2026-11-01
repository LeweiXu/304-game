import { useEffect, useMemo, useRef, useState } from 'react';
import rulesMd from '../../../public/rules.md?raw';
import { renderRules } from '../rules/renderRules';
import RefCards from '../rules/RefCards';
import '../styles/rules.css';

const sections = renderRules(rulesMd);

export default function RulesPage() {
  const ids = useMemo(() => sections.map((s) => s.id), []);
  const active = useActiveSection(ids);
  const barRef = useRef<HTMLOListElement>(null);

  useEffect(() => { document.title = 'Rules | 304'; }, []);

  // Content renders after the browser's own hash jump, so redo it once.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  // Keep the active phase visible when the bar overflows sideways.
  useEffect(() => {
    const bar = barRef.current;
    const link = bar?.querySelector<HTMLElement>('a.active');
    if (!bar || !link) return;
    const left = link.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + link.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({ left: left - 16, behavior: 'smooth' });
    }
  }, [active]);

  return (
    <>
      <header className="hero">
        <div>
          <h1><span>304</span>House rules</h1>
          <p>Four players, two teams, eight tricks. The three cards cover most questions mid-game; the full rules are
            below, in the order a game is played.</p>
        </div>
        <RefCards />
      </header>

      <nav className="phasebar" aria-label="Rules sections">
        <ol ref={barRef}>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={active === s.id ? 'active' : undefined}
                aria-current={active === s.id ? 'location' : undefined}>
                <span className={s.step ? 'num' : 'num dot'} aria-hidden="true">{s.step ?? ''}</span>
                {s.short}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main className="doc">
        {sections.map((s) => (
          <section key={s.id} id={s.id}>
            <h2>{s.step && <span className="step">Step {s.step}</span>}{s.title}</h2>
            <div dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))}
      </main>
    </>
  );
}

/** The last section whose top has scrolled above 30% of the viewport. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < line) cur = id;
      }
      setActive(cur);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [ids]);
  return active;
}
