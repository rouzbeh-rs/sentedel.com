import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.web.min.js';

const MODEL_ID = 'openai/privacy-filter';
const MODEL_LABEL = 'OpenAI Privacy Filter';
const HF_URL = 'https://huggingface.co/openai/privacy-filter';

env.allowRemoteModels = true;
env.useBrowserCache = true;

const DEFAULT_EDI = `ISA*00* *00* *ZZ*XSDBVFIK       *ZZ*NZEKSPLG       *240523*7647*^*00501*241535182*0*P*:~
GS*HC*XSDBVFIK*NZEKSPLG*20240523*7647*1*X*005010X222A1~
ST*837*0001*005010X222A1~
NM1*IL*1*JOHNSON*MICHAEL*T***MI*XKW123456789~
N3*1847 OAK STREET*APT 4B~
N4*CHICAGO*IL*60601~
DMG*D8*19920315*M~`;

const DEFAULT_PLAIN = `Patient Michael Johnson (DOB 03/15/1992) lives at 1847 Oak Street, Chicago IL 60601.
Member ID: XKW123456789. Email: michael.j@example.com.`;

/** @type {import('@huggingface/transformers').TokenClassificationPipeline | null} */
let classifier = null;

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
    $('load-btn').disabled = loading;
    $('run-btn').disabled = loading || !classifier;
}

function redactText(text, entities) {
    const sorted = [...entities].sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
    let out = text;
    for (const ent of sorted) {
        if (ent.start == null || ent.end == null) continue;
        out = out.slice(0, ent.start) + '[REDACTED]' + out.slice(ent.end);
    }
    return out;
}

function renderEntities(entities) {
    const tbody = $('entities-body');
    tbody.innerHTML = '';
    if (!entities.length) {
        tbody.innerHTML =
            '<tr><td colspan="4" class="py-4 px-4 text-sm text-navy/60">No spans detected.</td></tr>';
        return;
    }
    for (const ent of entities) {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-borderLight';
        tr.innerHTML = `
            <td class="py-3 px-4 font-mono text-xs">${ent.entity_group ?? ent.label ?? '—'}</td>
            <td class="py-3 px-4 font-mono text-xs">${ent.start ?? '—'}</td>
            <td class="py-3 px-4 font-mono text-xs">${ent.end ?? '—'}</td>
            <td class="py-3 px-4 font-mono text-xs">${ent.score != null ? (ent.score * 100).toFixed(1) + '%' : '—'}</td>
        `;
        tbody.appendChild(tr);
    }
}

async function tryLoad(device, dtype) {
    return pipeline('token-classification', MODEL_ID, { device, dtype });
}

async function loadModel() {
    setLoading(true);
    setStatus('Loading model… first download is ~800MB and may take several minutes.');

    const attempts = [];
    if (navigator.gpu) {
        attempts.push({ device: 'webgpu', dtype: 'q4', label: 'WebGPU (q4)' });
        attempts.push({ device: 'webgpu', dtype: 'q4f16', label: 'WebGPU (q4f16)' });
    }
    attempts.push({ device: 'wasm', dtype: 'q4', label: 'WASM (q4)' });

    classifier = null;
    let lastError = null;

    for (const attempt of attempts) {
        try {
            setStatus(`Trying ${attempt.label}…`);
            classifier = await tryLoad(attempt.device, attempt.dtype);
            setStatus(`Model ready (${attempt.label}).`, 'ok');
            $('run-btn').disabled = false;
            setLoading(false);
            return;
        } catch (err) {
            console.warn(`Load failed (${attempt.label}):`, err);
            lastError = err;
            classifier = null;
        }
    }

    setStatus(
        `Failed to load model: ${lastError?.message ?? 'Unknown error'}. Try Chrome or Edge with WebGPU enabled.`,
        'error',
    );
    setLoading(false);
}

async function runRedaction() {
    if (!classifier) return;
    const text = $('edi-input').value;
    if (!text.trim()) {
        setStatus('Paste some text first.', 'error');
        return;
    }

    setLoading(true);
    setStatus('Running detection…');
    const t0 = performance.now();

    try {
        const entities = await classifier(text, { aggregation_strategy: 'simple' });
        const ms = Math.round(performance.now() - t0);
        $('redacted-output').textContent = redactText(text, entities);
        renderEntities(entities);
        setStatus(`Done in ${ms} ms — ${entities.length} span(s) detected.`, 'ok');
    } catch (err) {
        console.error(err);
        setStatus(`Inference failed: ${err.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

function fillSample(kind) {
    $('edi-input').value = kind === 'plain' ? DEFAULT_PLAIN : DEFAULT_EDI;
}

$('load-btn').addEventListener('click', loadModel);
$('run-btn').addEventListener('click', runRedaction);
$('sample-edi').addEventListener('click', () => fillSample('edi'));
$('sample-plain').addEventListener('click', () => fillSample('plain'));

fillSample('edi');
setStatus(`Click Load model to download ${MODEL_LABEL} (~800MB, cached after first run).`);
