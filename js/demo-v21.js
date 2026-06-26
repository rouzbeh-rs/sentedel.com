const V21_API = 'https://rrsanjabi-sentedel-edi-phi-v21-api.hf.space/api';

const V21_SAMPLE = `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*^*00501*000000001*0*P*:~
GS*HC*SENDER*RECEIVER*20230101*1200*1*X*005010X222A1~
ST*837*0001*005010X222A1~
BHT*0019*00*123456*20230101*1200*CH~
NM1*IL*1*JOHNSON*MARY*T***MI*WXY293847102~
N3*1234 ELM STREET APT 5B~
N4*INDIANAPOLIS*IN*462201234~
DMG*D8*19830412*F~
CLM*CLM98765432*250.00***11:B:1*Y*A*Y*Y*P~
NTE*ADD*Patient MARY JOHNSON DOB 1983/04/12 referred by DR. MICHAEL THOMPSON at REGIONAL MEDICAL CENTER for chronic lumbar pain evaluation. Member ID WXY293847102.~
HI*ABK:M5456~
LX*1~
SV1*HC:99213*250.00*UN*1***1~
DTP*472*D8*20230101~
SE*14*0001~
GE*1*1~
IEA*1*000000001~`;

(function () {
    const $ = (id) => document.getElementById(id);
    if (!$('v21-input')) return;

    let ready = false;

    function setStatus(msg, tone) {
        const el = $('v21-status');
        el.textContent = msg;
        el.className =
            'max-w-4xl font-mono text-xs px-3 py-2 sharp-border mb-4 ' +
            (tone === 'error'
                ? 'bg-red-50 text-red-700 border-red-200'
                : tone === 'ok'
                  ? 'bg-accent/10 text-navy border-accent/40'
                  : 'bg-grayBg text-navy/70');
    }

    function highlightOutput(text, entities) {
        if (!entities || !entities.length) return escapeHtml(text);

        const sorted = [...entities].sort((a, b) => a.start - b.start);
        let result = '';
        let cursor = 0;
        for (const ent of sorted) {
            if (ent.start > cursor) result += escapeHtml(text.slice(cursor, ent.start));
            result +=
                '<span style="background:rgba(0,229,255,0.18);border-bottom:2px solid #00E5FF;padding:0 2px;">' +
                escapeHtml(text.slice(ent.start, ent.end)) +
                '</span>';
            cursor = ent.end;
        }
        if (cursor < text.length) result += escapeHtml(text.slice(cursor));
        return result;
    }

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderEntities(entities, originalText) {
        const tbody = $('v21-entities');
        tbody.innerHTML = '';
        if (!entities.length) {
            tbody.innerHTML =
                '<tr><td colspan="4" class="py-4 px-4 text-sm text-navy/60">No PHI spans detected.</td></tr>';
            return;
        }
        for (const ent of entities) {
            const word = originalText.slice(ent.start, ent.end);
            const tr = document.createElement('tr');
            tr.className = 'border-b border-borderLight';
            tr.innerHTML =
                '<td class="py-3 px-4 font-mono text-xs">' + escapeHtml(word) + '</td>' +
                '<td class="py-3 px-4 font-mono text-xs">' + escapeHtml(ent.label || ent.entity || '') + '</td>' +
                '<td class="py-3 px-4 font-mono text-xs">' + ent.start + '</td>' +
                '<td class="py-3 px-4 font-mono text-xs">' + ent.end + '</td>';
            tbody.appendChild(tr);
        }
    }

    async function checkHealth() {
        setStatus('Connecting to v2.1 API…', 'neutral');
        try {
            const res = await fetch(V21_API + '/health');
            const data = await res.json();
            if (data.ok) {
                ready = true;
                setStatus('v2.1 API ready. Paste EDI and click Detect & redact.', 'ok');
                $('v21-run').disabled = false;
                return;
            }
            setStatus(data.error ? 'API reachable but model not loaded: ' + data.error : 'API reachable, model loading…', 'error');
        } catch (e) {
            setStatus('Cannot reach v2.1 API — the Space may be starting up. Wait a minute and refresh.', 'error');
        }
    }

    async function run() {
        if (!ready) return;
        const text = $('v21-input').value;
        if (!text.trim()) { setStatus('Paste an EDI transaction first.', 'error'); return; }

        $('v21-run').disabled = true;
        setStatus('Running v2.1 PHI detection…', 'neutral');

        try {
            const res = await fetch(V21_API + '/redact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            const data = await res.json();
            if (!res.ok) {
                const detail = data.detail;
                throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Request failed');
            }

            $('v21-output').innerHTML = highlightOutput(text, data.entities);
            renderEntities(data.entities, text);
            setStatus(
                'Done in ' + data.latency_ms + ' ms — ' + data.entities.length + ' span(s) detected. Model: ' + (data.model_version || 'v2.1'),
                'ok',
            );
        } catch (err) {
            setStatus('Inference failed: ' + err.message, 'error');
        } finally {
            $('v21-run').disabled = !ready;
        }
    }

    $('v21-input').value = V21_SAMPLE;
    $('v21-run').addEventListener('click', run);
    $('v21-sample').addEventListener('click', function () { $('v21-input').value = V21_SAMPLE; });
    checkHealth();
})();
