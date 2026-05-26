const API = '/api';

const DEFAULT_EDI = `ISA*00* *00* *ZZ*XSDBVFIK       *ZZ*NZEKSPLG       *240523*7647*^*00501*241535182*0*P*:~
GS*HC*XSDBVFIK*NZEKSPLG*20240523*7647*1*X*005010X222A1~
ST*837*0001*005010X222A1~
NM1*IL*1*JOHNSON*MICHAEL*T***MI*XKW123456789~
N3*1847 OAK STREET*APT 4B~
N4*CHICAGO*IL*60601~
DMG*D8*19920315*M~`;

const $ = (id) => document.getElementById(id);

function setStatus(message, tone = 'neutral') {
    const el = $('status');
    el.textContent = message;
    el.className =
        'font-mono text-xs px-3 py-2 sharp-border ' +
        (tone === 'error'
            ? 'bg-red-50 text-red-700 border-red-200'
            : tone === 'ok'
              ? 'bg-accent/10 text-navy border-accent/40'
              : 'bg-grayBg text-navy/70');
}

function setLoading(loading) {
    $('run-btn').disabled = loading || !window.__modelReady;
}

function renderEntities(entities) {
    const tbody = $('entities-body');
    tbody.innerHTML = '';
    if (!entities.length) {
        tbody.innerHTML =
            '<tr><td colspan="4" class="py-4 px-4 text-sm text-navy/60">No PHI spans detected.</td></tr>';
        return;
    }
    for (const ent of entities) {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-borderLight';
        tr.innerHTML = `
            <td class="py-3 px-4 font-mono text-xs">${ent.label}</td>
            <td class="py-3 px-4 font-mono text-xs">${ent.start}</td>
            <td class="py-3 px-4 font-mono text-xs">${ent.end}</td>
            <td class="py-3 px-4 font-mono text-xs">${(ent.score * 100).toFixed(1)}%</td>
        `;
        tbody.appendChild(tr);
    }
}

function isLocalServer() {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function showPublicSiteMessage() {
    window.__modelReady = false;
    $('public-banner')?.classList.remove('hidden');
    $('setup-hint')?.classList.add('hidden');
    $('run-btn').disabled = true;
    setStatus(
        'This page is for local development only. Use the Public playground on sentedel.com.',
        'error',
    );
}

async function checkHealth() {
    if (!isLocalServer()) {
        showPublicSiteMessage();
        return;
    }

    setStatus('Connecting to local inference server…');
    try {
        const res = await fetch(`${API}/health`);
        const data = await res.json();
        if (data.ok) {
            window.__modelReady = true;
            setStatus('Model loaded on local server. Ready to redact.', 'ok');
            $('run-btn').disabled = false;
            return;
        }
        window.__modelReady = false;
        setStatus(
            data.error
                ? `Server running, but model failed to load: ${data.error}`
                : 'Server running, but model is not loaded.',
            'error',
        );
        $('setup-hint').classList.remove('hidden');
    } catch {
        window.__modelReady = false;
        setStatus(
            'Cannot reach the demo server. Start it with: uvicorn server.app:app --reload --port 8000',
            'error',
        );
        $('setup-hint').classList.remove('hidden');
    }
}

async function runRedaction() {
    if (!window.__modelReady) return;
    const text = $('edi-input').value;
    if (!text.trim()) {
        setStatus('Paste an EDI transaction first.', 'error');
        return;
    }

    setLoading(true);
    setStatus('Running PHI detection…');

    try {
        const res = await fetch(`${API}/redact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) {
            const detail = data.detail;
            const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
            throw new Error(msg || 'Request failed');
        }
        $('redacted-output').textContent = data.redacted;
        renderEntities(data.entities);
        setStatus(`Done in ${data.latency_ms} ms — ${data.entities.length} span(s) detected.`, 'ok');
    } catch (err) {
        console.error(err);
        setStatus(`Inference failed: ${err.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

window.__modelReady = false;
$('edi-input').value = DEFAULT_EDI;
$('run-btn').addEventListener('click', runRedaction);
$('run-btn').disabled = true;
checkHealth();
