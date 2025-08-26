const $ = (s) => document.querySelector(s);

const els = {
    api: $('#api'),
    // 🔽 novos elementos para múltiplos pacotes
    pkgList: $('#pkgList'),
    pkgExtra: $('#pkg-extra'),
    pkg3652: $('#pkg-3652'),
    pkg3559: $('#pkg-3559'),
    pkg3496: $('#pkg-3496'),
    // 🔼
    type: $('#type'),
    quantity: $('#quantity'),
    duration: $('#duration'),
    unit: $('#unit'),
    alias: $('#alias'),
    isCleanable: $('#isCleanable'),
    endDate: $('#endDate'),
    activateCount: $('#activateCount'),
    multiBox: $('#multiBox'),
    preview: $('#preview'),
    resp: $('#resp'),
    respEmpty: $('#respEmpty'),
    statusArea: $('#statusArea'),
    send: $('#send'),
    copyJson: $('#copy-json'),
    copyKeys: $('#copy-keys'),
    keysBox: $('#keysBox'),
};

// Persistência simples
const LS_KEY = 'vlk_form';
try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    for (const k in saved) {
        if (els[k]) {
            if (els[k].type === 'checkbox') els[k].checked = !!saved[k];
            else els[k].value = saved[k];
        }
    }
} catch {}

function saveState() {
    const st = {};
    Object.entries(els).forEach(([k, el]) => {
        if (!el || !('value' in el || 'checked' in el)) return;
        st[k] = el.type === 'checkbox' ? el.checked : el.value;
    });
    localStorage.setItem(LS_KEY, JSON.stringify(st));
}

function isoEndDate() {
    if (!els.endDate.value) return undefined;
    const d = new Date(els.endDate.value + 'T23:59:59');
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

// 🔽 coleta IDs selecionados + extras
function getSelectedPackageIds() {
    const selected = [
        ...els.pkgList.querySelectorAll(
            'input[type="checkbox"][data-id]:checked'
        ),
    ].map((cb) => parseInt(cb.dataset.id, 10));

    const extras = (els.pkgExtra.value || '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

    // remove duplicados
    return [...new Set([...selected, ...extras])];
}

function buildBody() {
    const packageIds = getSelectedPackageIds();
    const quantity = parseInt(els.quantity.value || '1', 10);
    const duration = parseInt(els.duration.value || '1', 10);
    const unit = els.unit.value;
    const type = els.type.value;
    const alias = els.alias.value.trim();
    const isCleanable = !!els.isCleanable.checked;
    const endDate = isoEndDate();

    const body = {
        type,
        quantity,
        packageIds,
        duration,
        unit,
        alias: alias || undefined,
        isCleanable,
        endDate,
    };
    if (type === 'multi') {
        const ac = parseInt(els.activateCount.value || '2', 10);
        body.activateCount = ac;
    }
    return body;
}

function refreshPreview() {
    const b = buildBody();
    els.preview.textContent = JSON.stringify(b, null, 2);
}

function setStatus(ok, msg) {
    els.statusArea.innerHTML = `<span class="tag ${
        ok ? 'ok' : 'bad'
    }">${msg}</span>`;
}

function toggleLoading(on) {
    els.send.disabled = on;
    els.send.innerHTML = on
        ? `<span class="loader" aria-hidden="true"></span>`
        : 'Gerar chaves';
}

function parseKeysFromResponse(obj) {
    if (obj && Array.isArray(obj.data)) return obj.data;
    if (obj && typeof obj.raw === 'string') {
        const m = obj.raw.match(/authtool[^\s"']+/g);
        if (m) return m;
    }
    if (Array.isArray(obj)) return obj;
    return [];
}

function renderKeys(keys) {
    if (!keys.length) {
        els.keysBox.style.display = 'none';
        els.keysBox.innerHTML = '';
        return;
    }
    els.keysBox.style.display = '';
    els.keysBox.innerHTML = keys
        .map(
            (k) => `<div class="key">
        <code>${k}</code>
        <button class="btn btn-ghost" data-copy="${k}">copiar</button>
      </div>`
        )
        .join('');
}

// Eventos
document.addEventListener('input', (e) => {
    if (e.target === els.type) {
        const multi = els.type.value === 'multi';
        els.multiBox.style.display = multi ? '' : 'none';
    }
    refreshPreview();
    saveState();
});

['change', 'keyup'].forEach((ev) => {
    document.addEventListener(ev, (e) => {
        if (
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'SELECT' ||
            e.target.tagName === 'TEXTAREA'
        ) {
            refreshPreview();
            saveState();
        }
    });
});

els.copyJson.addEventListener('click', () => {
    navigator.clipboard.writeText(els.preview.textContent || '{}');
    setStatus(true, 'JSON copiado');
    setTimeout(() => (els.statusArea.innerHTML = ''), 2500);
});

els.keysBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-copy]');
    if (!btn) return;
    const v = btn.getAttribute('data-copy');
    navigator.clipboard.writeText(v || '');
    setStatus(true, 'Chave copiada');
    setTimeout(() => (els.statusArea.innerHTML = ''), 2000);
});

els.copyKeys.addEventListener('click', () => {
    const codes = [...els.keysBox.querySelectorAll('code')]
        .map((c) => c.textContent.trim())
        .filter(Boolean);
    if (!codes.length) {
        setStatus(false, 'Sem chaves para copiar');
        return;
    }
    navigator.clipboard.writeText(codes.join('\n'));
    setStatus(true, `${codes.length} chave(s) copiadas`);
    setTimeout(() => (els.statusArea.innerHTML = ''), 2500);
});

els.send.addEventListener('click', async () => {
    const url = els.api.value || '/api/key';
    const body = buildBody();

    // validações
    if (!body.packageIds?.length)
        return setStatus(false, 'Selecione pelo menos 1 pacote');
    if (body.quantity < 1) return setStatus(false, 'Quantidade inválida');
    if (body.duration < 1) return setStatus(false, 'Duração inválida');
    if (
        body.type === 'multi' &&
        (!body.activateCount || body.activateCount < 2)
    )
        return setStatus(false, 'activateCount ≥ 2 para multi');

    toggleLoading(true);
    setStatus(true, 'Enviando…');
    els.resp.style.display = 'none';
    els.respEmpty.style.display = '';
    renderKeys([]);

    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const text = await r.text();
        const isJSON =
            text.trim().startsWith('{') || text.trim().startsWith('[');
        const out = isJSON ? JSON.parse(text) : { raw: text };

        els.resp.textContent = JSON.stringify(out, null, 2);
        els.resp.style.display = 'block';
        els.respEmpty.style.display = 'none';

        const keys = parseKeysFromResponse(out);
        renderKeys(keys);

        if (r.ok)
            setStatus(
                true,
                `Chave(s) criada(s): ${keys.length || body.quantity}`
            );
        else setStatus(false, `Erro HTTP ${r.status}`);
    } catch (err) {
        els.resp.textContent = String(err);
        els.resp.style.display = 'block';
        els.respEmpty.style.display = 'none';
        setStatus(false, 'Falha na requisição');
    } finally {
        toggleLoading(false);
    }
});

// init
refreshPreview();
els.multiBox.style.display = els.type.value === 'multi' ? '' : 'none';
