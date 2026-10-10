// DOM overlay: scene captions, evidence-tagged facts, clock, gauge, summary and end card.
import { fmtClock } from './util.js';
import { SUMMARY_ROWS, END_MESSAGE } from './timeline.js';

const TAG_LABEL = { green: 'Established physics', amber: 'Model-dependent', red: 'Speculative visualization' };
const $ = (id) => document.getElementById(id);

export class ScienceOverlay {
  constructor(scenes, total) {
    this.scenes = scenes; this.total = total;
    this.el = {
      kicker: $('sceneKicker'), title: $('sceneTitle'), desc: $('sceneDesc'), facts: $('facts'), shot: $('shotName'),
      clock: $('clockValue'), progress: $('progressBar'), scrub: $('scrubber'), time: $('timeText'),
      gaugeWrap: $('gauge'), gaugeFill: $('gaugeFill'), gaugeVal: $('gaugeVal'), scale: $('scaleBadge'),
      summary: $('summary'), summaryBody: $('summaryBody'), end: $('endcard'), chips: $('sceneChips'), dot: $('sceneDot'),
    };
    this.index = -1; this.shown = -1;
    this.el.summaryBody.innerHTML = SUMMARY_ROWS.map(([k, v, tag]) => `<tr><th>${k}</th><td><span class="dot ${tag}"></span>${v}</td></tr>`).join('');
    $('endEstablished').textContent = END_MESSAGE.established;
    $('endHypothetical').textContent = END_MESSAGE.hypothetical;
    this.el.chips.innerHTML = scenes.map((s, i) => `<button class="chip" data-i="${i}" title="${s.title}"><b>${i + 1}</b><span>${s.title}</span></button>`).join('');
    const ticks = $('ticks');
    ticks.innerHTML = scenes.slice(1).map((s) => `<i style="left:${(s.start / total) * 100}%"></i>`).join('');
  }

  setScene(i) {
    const s = this.scenes[i];
    this.index = i; this.shown = -1;
    this.el.kicker.textContent = `SCENE ${i + 1} / ${this.scenes.length}`;
    this.el.title.textContent = s.title;
    this.el.desc.textContent = s.description;
    this.el.dot.className = `dot ${s.tag}`;
    this.el.facts.innerHTML = s.facts.map((f) => `<li class="fact ${f.tag}"><span class="tag">${TAG_LABEL[f.tag]}</span>${f.text}</li>`).join('');
    this.el.scale.textContent = s.scaleNote ? `Not to scale · ${s.scaleNote}` : '';
    this.el.scale.classList.toggle('on', !!s.scaleNote);
    this.el.gaugeWrap.classList.toggle('on', !!s.gauge);
    this.el.chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', +c.dataset.i === i));
    const act = this.el.chips.querySelector('.chip.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  update(t, loc, hud) {
    if (loc.index !== this.index) this.setScene(loc.index);
    const s = loc.scene;
    const n = s.facts.filter((f) => loc.u >= f.at).length;
    if (n !== this.shown) {
      this.shown = n;
      [...this.el.facts.children].forEach((li, k) => li.classList.toggle('on', k < n));
    }
    this.el.clock.textContent = fmtClock(t);
    this.el.time.textContent = `${fmtClock(t)} / ${fmtClock(this.total)}`;
    const frac = t / this.total;
    this.el.progress.style.transform = `scaleX(${frac})`;
    if (document.activeElement !== this.el.scrub) this.el.scrub.value = Math.round(frac * 1000);
    this.el.shot.textContent = hud.shot;
    if (s.gauge) {
      const v = Math.round(hud.intensity * 100);
      this.el.gaugeFill.style.width = `${v}%`; this.el.gaugeVal.textContent = `${v}%`;
    }
    this.el.summary.classList.toggle('on', !!s.summary && loc.u > 0.3 && t < this.total - 3.2);
    const ending = t >= this.total - 2.2;
    this.el.end.classList.toggle('on', ending);
    document.getElementById('app').classList.toggle('ending', ending);
  }
}
