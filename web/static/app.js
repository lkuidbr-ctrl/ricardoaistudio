const API = {
  async setKey(key) {
    const res = await fetch("/api/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fal_key: key }),
    });
    return res.json();
  },
  async hasKey() {
    const res = await fetch("/api/key");
    return res.json();
  },
  async status() {
    const res = await fetch("/api/status");
    return res.json();
  },
  async job(id) {
    const res = await fetch(`/api/jobs/${id}`);
    return res.json();
  },
};

function el(id) {
  return document.getElementById(id);
}

async function refreshStatus() {
  const st = await API.status();
  renderAsset("character_reference", st.character_reference, "img");
  renderAsset("location_reference", st.location_reference, "img");
  renderAsset("character_sheet", st.character_sheet, "img");
  renderAsset("location_sheet", st.location_sheet, "img");
  for (let i = 1; i <= 7; i++) {
    renderAsset(`shot_${i}`, st.shots[String(i)], "video");
  }
}

function renderAsset(key, asset, kind) {
  const container = el(`preview_${key}`);
  if (!container) return;
  if (!asset) {
    container.innerHTML = '<span class="placeholder">Ainda não gerado</span>';
    return;
  }
  const bust = `${asset.url}?t=${Date.now()}`;
  container.innerHTML =
    kind === "img"
      ? `<img src="${bust}" alt="${key}">`
      : `<video src="${bust}" controls></video>`;
}

function setLog(area, lines) {
  area.textContent = (lines || []).join("\n");
  area.scrollTop = area.scrollHeight;
}

function pollJob(jobId, logArea, button) {
  button.disabled = true;
  const timer = setInterval(async () => {
    const job = await API.job(jobId);
    setLog(logArea, job.logs);
    if (job.status === "done" || job.status === "error") {
      clearInterval(timer);
      button.disabled = false;
      if (job.status === "error") {
        logArea.textContent += `\n[erro] ${job.error}`;
      }
      refreshStatus();
    }
  }, 1200);
}

async function runStep(path, { formData, body, button, logAreaId }) {
  const logArea = el(logAreaId);
  logArea.textContent = "";
  const opts = formData
    ? { method: "POST", body: formData }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      };
  const res = await fetch(path, opts);
  const data = await res.json();
  if (data.error) {
    logArea.textContent = `[erro] ${data.error}`;
    return;
  }
  pollJob(data.job_id, logArea, button);
}

document.addEventListener("DOMContentLoaded", async () => {
  const keyStatus = el("key_status");
  const savedKey = sessionStorage.getItem("fal_key_hint");
  if (savedKey) el("fal_key_input").value = savedKey;

  const { has_key } = await API.hasKey();
  keyStatus.textContent = has_key
    ? "Chave configurada nesta sessão do servidor."
    : "Nenhuma chave configurada ainda.";

  el("save_key_btn").addEventListener("click", async () => {
    const key = el("fal_key_input").value.trim();
    if (!key) return;
    const result = await API.setKey(key);
    if (result.error) {
      keyStatus.textContent = `Erro: ${result.error}`;
      return;
    }
    sessionStorage.setItem("fal_key_hint", key);
    keyStatus.textContent = "Chave configurada nesta sessão do servidor.";
  });

  el("btn_character").addEventListener("click", () => {
    const fd = new FormData();
    fd.append("force", el("force_character").checked ? "true" : "false");
    const file = el("character_photo").files[0];
    if (file) fd.append("reference_photo", file);
    runStep("/api/generate/character", {
      formData: fd,
      button: el("btn_character"),
      logAreaId: "log_character",
    });
  });

  el("btn_location").addEventListener("click", () => {
    runStep("/api/generate/location", {
      body: { force: el("force_location").checked },
      button: el("btn_location"),
      logAreaId: "log_location",
    });
  });

  el("btn_character_sheet").addEventListener("click", () => {
    runStep("/api/generate/character-sheet", {
      body: { force: el("force_character_sheet").checked },
      button: el("btn_character_sheet"),
      logAreaId: "log_character_sheet",
    });
  });

  el("btn_location_sheet").addEventListener("click", () => {
    runStep("/api/generate/location-sheet", {
      body: { force: el("force_location_sheet").checked },
      button: el("btn_location_sheet"),
      logAreaId: "log_location_sheet",
    });
  });

  for (let i = 1; i <= 7; i++) {
    el(`btn_shot_${i}`).addEventListener("click", () => {
      runStep(`/api/generate/shot/${i}`, {
        body: { force: el(`force_shot_${i}`).checked },
        button: el(`btn_shot_${i}`),
        logAreaId: `log_shot_${i}`,
      });
    });
  }

  refreshStatus();
});
