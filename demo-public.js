import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0';

env.allowRemoteModels = true;
env.useBrowserCache = true;

const MODELS = {
    'openai/privacy-filter': {
        label: 'OpenAI Privacy Filter',
        browserReady: true,
        dtype: () => (navigator.gpu ? 'q4f16' : 'q4'),
        note: 'Apache 2.0 · runs in-browser via Transformers.js',
        hf: 'https://huggingface.co/openai/privacy-filter',
    },
    'knowledgator/gliner-pii-base-v1.0': {
        label: 'GLiNER PII Base',
        browserReady: false,
        note: 'In our benchmark · GLiNER uses a different runtime (not Transformers.js)',
        hf: 'https://huggingface.co/knowledgator/gliner-pii-base-v1.0',
    },
    'nvidia/gliner-PII': {
        label: 'NVIDIA GLiNER PII',
        browserReady: false,
        note: 'In our benchmark · no browser ONNX bundle on Hugging Face',
        hf: 'https://huggingface.co/nvidia/gliner-PII',
    },
};

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
let loadedModelId = null;

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

function selectedModelId() {
    return $('model-select').value;
}

function selectedModel() {
    return MODELS[selectedModelId()];
}

function updateModelNote() {
    const model = selectedModel();
    $('model-note').textContent = model.note;
    $('model-link').href = model.hf;
    $('model-link').textContent = 'View on Hugging Face';

    const ready = model.browserReady;
    $('load-btn').disabled = !ready;
    $('run-btn').disabled = !ready || !classifier || loadedModelId !== selectedModelId();

    if (!ready) {
        classifier = null;
        loadedModelId = null;
        setStatus(`${model.label} is not available in-browser yet. Select OpenAI Privacy Filter.`, 'error');
    } else if (loadedModelId !== selectedModelId()) {
        setStatus(`Select Load model to download ${model.label} (~800MB, cached after first run).`);
    }
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

async function loadModel() {
    const modelId = selectedModelId();
    const model = selectedModel();
    if (!model.browserReady) return;

    setLoading(true);
    const useWebGpu = !!navigator.gpu;
    const dtype = model.dtype();
    setStatus(
        `Downloading ${model.label} (${dtype}, ${useWebGpu ? 'WebGPU' : 'WASM'})… First load can take several minutes.`,
    );

    try {
        classifier = await pipeline('token-classification', modelId, {
            device: useWebGpu ? 'webgpu' : 'wasm',
            dtype,
        });
        loadedModelId = modelId;
        setStatus(`Model ready: ${model.label} (${dtype}, ${useWebGpu ? 'WebGPU' : 'WASM'}).`, 'ok');
        $('run-btn').disabled = false;
    } catch (err) {
        console.error(err);
        classifier = null;
        loadedModelId = null;
        setStatus(`Failed to load model: ${err.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

async function runRedaction() {
    if (!classifier || loadedModelId !== selectedModelId()) return;
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

$('model-select').addEventListener('change', updateModelNote);
$('load-btn').addEventListener('click', loadModel);
$('run-btn').addEventListener('click', runRedaction);
$('sample-edi').addEventListener('click', () => fillSample('edi'));
$('sample-plain').addEventListener('click', () => fillSample('plain'));

fillSample('edi');
updateModelNote();
