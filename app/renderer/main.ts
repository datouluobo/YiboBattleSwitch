interface OperationResult {
  ok: boolean;
  message: string;
  failureReason?: string;
}

interface AccountListItem {
  id: string;
  email: string;
  maskedEmail: string;
  description: string;
  lastSaved: string;
  sortOrder?: number;
}

interface AppStateDto {
  appName: string;
  version: string;
  gameDirectory: string;
  libraryDirectory: string;
  dataDirectory: string;
  currentLoginName: string;
  currentSavedAccountName: string;
  currentSavedAccountCandidates: string[];
  currentGameAccount: string;
  wowAccounts: string[];
  accountCount: number;
  importableCount: number;
  permissionLabel: string;
  accounts: AccountListItem[];
  logs: string[];
}

interface AppSettings {
  gameDirectory: string;
  battleNetLauncherPath: string;
  wowDirectory: string;
  battleNetSwitchProfile: "N" | "D" | "W";
  minimizeToTrayOnClose: boolean;
  launchAtLogin: boolean;
  minimizeOnLaunch: boolean;
  skipSwitchConfirm: boolean;
  revealedAccountIds?: string[];
  lastSelectedAccountId: string;
}

type ConfirmDialogOption = {
  label: string;
  checked?: boolean;
};

type ConfirmDialogResult = {
  confirmed: boolean;
  optionChecked: boolean;
};

type FormField = {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: string;
};

const state = {
  selectedAccountId: "",
  payload: null as AppStateDto | null,
  settings: null as AppSettings | null,
  revealedAccountIds: new Set<string>(),
  dragAccountId: "",
  dragOverAccountId: "",
  dragOverPosition: "after" as "before" | "after",
  dragPointerId: -1,
  actionsBound: false,
  confirmResolve: null as null | ((value: ConfirmDialogResult) => void),
  formResolve: null as null | { resolve: (value: Record<string, string> | null) => void; fields: FormField[] },
  messageResolve: null as null | ((value: boolean) => void)
};

const SWITCH_PROFILE_LABELS: Record<AppSettings["battleNetSwitchProfile"], string> = {
  N: "N 方案 / 备用重恢复",
  D: "D 方案 / 主力轻切换",
  W: "W 方案 / 槽位切换"
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) {
    dialog.close();
  }
}

function showNotice(message: string, kind: "success" | "error"): void {
  const banner = document.getElementById("noticeBanner") as HTMLDivElement;
  banner.textContent = message;
  banner.className = `rounded-[10px] border px-4 py-2 text-[14px] font-medium transition-opacity ${kind === "error" ? "notice-error" : "notice-success"}`;
}

function clearNotice(): void {
  const banner = document.getElementById("noticeBanner") as HTMLDivElement;
  banner.textContent = "";
  banner.className = "notice-idle rounded-[10px] border px-4 py-2 text-[14px] font-medium transition-opacity";
}

function showMessage(message: string, title = "提示"): Promise<boolean> {
  const dialog = document.getElementById("messageDialog") as HTMLDialogElement;
  (document.getElementById("messageDialogTitle") as HTMLHeadingElement).textContent = title;
  (document.getElementById("messageDialogBody") as HTMLParagraphElement).textContent = message;
  dialog.showModal();
  return new Promise((resolve) => {
    state.messageResolve = resolve;
  });
}

function askConfirm(title: string, message: string, option?: ConfirmDialogOption): Promise<ConfirmDialogResult> {
  const dialog = document.getElementById("confirmDialog") as HTMLDialogElement;
  const optionWrap = document.getElementById("confirmDialogOptionWrap") as HTMLLabelElement;
  const optionCheckbox = document.getElementById("confirmDialogOptionCheckbox") as HTMLInputElement;
  const optionLabel = document.getElementById("confirmDialogOptionLabel") as HTMLSpanElement;
  (document.getElementById("confirmDialogTitle") as HTMLHeadingElement).textContent = title;
  (document.getElementById("confirmDialogMessage") as HTMLParagraphElement).textContent = message;
  optionWrap.classList.toggle("hidden", !option);
  optionWrap.classList.toggle("flex", Boolean(option));
  optionCheckbox.checked = Boolean(option?.checked);
  optionLabel.textContent = option?.label || "";
  dialog.showModal();
  return new Promise((resolve) => {
    state.confirmResolve = resolve;
  });
}

function askForm(config: { title: string; hint?: string; submitText?: string; fields: FormField[] }): Promise<Record<string, string> | null> {
  const dialog = document.getElementById("formDialog") as HTMLDialogElement;
  (document.getElementById("formDialogTitle") as HTMLHeadingElement).textContent = config.title;
  (document.getElementById("formDialogHint") as HTMLParagraphElement).textContent = config.hint || "";
  (document.getElementById("formDialogSubmit") as HTMLButtonElement).textContent = config.submitText || "确认";

  const fieldsEl = document.getElementById("formDialogFields") as HTMLDivElement;
  fieldsEl.innerHTML = config.fields.map((field) => {
    const value = escapeHtml(field.value || "");
    return `
      <label class="block">
        <span class="mb-2 block text-[13px] font-semibold text-ink">${escapeHtml(field.label)}</span>
        ${field.type === "textarea"
          ? `<textarea class="min-h-[96px] w-full rounded-[10px] border border-stroke bg-surface px-3 py-2 text-[14px] text-ink outline-none" data-field="${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder || "")}">${value}</textarea>`
          : `<input class="w-full rounded-[10px] border border-stroke bg-surface px-3 py-2 text-[14px] text-ink outline-none" data-field="${escapeHtml(field.name)}" type="${escapeHtml(field.type || "text")}" value="${value}" placeholder="${escapeHtml(field.placeholder || "")}">`}
      </label>
    `;
  }).join("");

  dialog.showModal();
  return new Promise((resolve) => {
    state.formResolve = { resolve, fields: config.fields };
  });
}

async function commitAccountReorder(dragAccountId: string, dragOverAccountId: string, dragOverPosition: "before" | "after"): Promise<void> {
  if (!state.payload || !dragAccountId || !dragOverAccountId || dragAccountId === dragOverAccountId) {
    return;
  }
  const current = [...state.payload.accounts];
  const fromIndex = current.findIndex((item) => item.id === dragAccountId);
  if (fromIndex < 0) {
    return;
  }
  const [moved] = current.splice(fromIndex, 1);
  const targetIndex = current.findIndex((item) => item.id === dragOverAccountId);
  if (targetIndex < 0) {
    return;
  }
  current.splice(dragOverPosition === "before" ? targetIndex : targetIndex + 1, 0, moved);
  const result = await runAction(() => window.api.reorderAccounts(current.map((item) => item.id)), "排序失败");
  if (!result) {
    return;
  }
  state.payload = {
    ...state.payload,
    accounts: current
  };
  showNotice("账号顺序已更新。", "success");
  await refreshState();
}

function resetDragState(): void {
  state.dragAccountId = "";
  state.dragOverAccountId = "";
  state.dragOverPosition = "after";
  state.dragPointerId = -1;
  document.body.classList.remove("drag-sort-active");
}

function bindPluginTooltips(): void {
  const tooltip = document.getElementById("pluginTooltip") as HTMLDivElement | null;
  if (!tooltip) {
    return;
  }
  const showTooltip = (link: HTMLAnchorElement) => {
    const message = link.dataset.tooltip;
    if (!message) {
      return;
    }
    tooltip.textContent = message;
    tooltip.classList.remove("hidden");
    const rect = link.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tooltipRect.width - 16, Math.max(16, rect.left + rect.width / 2 - tooltipRect.width / 2));
    const top = Math.max(16, rect.top - tooltipRect.height - 12);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const hideTooltip = () => {
    tooltip.classList.add("hidden");
  };
  document.querySelectorAll<HTMLAnchorElement>("[data-tooltip]").forEach((link) => {
    link.addEventListener("mouseenter", () => showTooltip(link));
    link.addEventListener("focus", () => showTooltip(link));
    link.addEventListener("mouseleave", hideTooltip);
    link.addEventListener("blur", hideTooltip);
  });
  window.addEventListener("scroll", hideTooltip, { passive: true });
}

async function syncWindowState(): Promise<void> {
  const maxButton = document.getElementById("windowMaxBtn") as HTMLButtonElement | null;
  if (!maxButton) {
    return;
  }
  const windowState = await runAction(() => window.api.getWindowState(), "窗口状态获取失败");
  if (!windowState) {
    return;
  }
  maxButton.setAttribute("aria-label", windowState.isMaximized ? "还原窗口" : "最大化");
}

function renderRows(accounts: AccountListItem[]): void {
  const rows = document.getElementById("rows") as HTMLDivElement;
  rows.innerHTML = "";

  if (!accounts.length) {
    rows.innerHTML = "<div class='px-6 py-8 text-[14px] text-ink-soft'>当前账号库为空。可以先点击“保存当前登录”建立首个账号快照。</div>";
    return;
  }

  if (!accounts.some((item) => item.id === state.selectedAccountId)) {
    state.selectedAccountId = accounts[0].id;
  }

  accounts.forEach((account) => {
    const row = document.createElement("div");
    row.className = [
      "grid w-full grid-cols-[56px_1.2fr_1.1fr_1fr_44px] items-center px-4 py-6 text-left",
      "drag-row transition-[transform,box-shadow,background-color] duration-180 ease-out hover:bg-surface-soft",
      account.id === state.dragAccountId ? "drag-row-active" : "",
      account.id === state.dragOverAccountId ? `drag-row-target ${state.dragOverPosition === "before" ? "drag-row-target-before" : "drag-row-target-after"}` : "",
      account.id === state.selectedAccountId ? "row-selected" : ""
    ].join(" ");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.dataset.accountId = account.id;
    const isRevealed = state.revealedAccountIds.has(account.id);
    row.innerHTML = `
      <button class="drag-handle flex cursor-grab items-center justify-center rounded-[10px] active:cursor-grabbing ${state.dragAccountId === account.id ? "drag-handle-active" : ""}" data-drag-handle="true" type="button" aria-label="拖拽排序">
        <span class="action-icon" aria-hidden="true">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="7" r="1.25"></circle>
            <circle cx="15" cy="7" r="1.25"></circle>
            <circle cx="9" cy="12" r="1.25"></circle>
            <circle cx="15" cy="12" r="1.25"></circle>
            <circle cx="9" cy="17" r="1.25"></circle>
            <circle cx="15" cy="17" r="1.25"></circle>
          </svg>
        </span>
      </button>
      <div class="flex items-center gap-2">
        <div class="text-[15px] font-semibold ${account.id === state.selectedAccountId ? "text-primary" : "text-ink"}">${escapeHtml(isRevealed ? account.email : account.maskedEmail)}</div>
        <button class="text-slate-400 transition-colors hover:text-primary" data-toggle-visibility="true" type="button" aria-label="${isRevealed ? "隐藏完整账号" : "显示完整账号"}">
          <span class="action-icon" aria-hidden="true">
            ${isRevealed
              ? `<svg fill="none" viewBox="0 0 24 24"><path d="M3.75 12s2.75-5 8.25-5 8.25 5 8.25 5-2.75 5-8.25 5-8.25-5-8.25-5z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><circle cx="12" cy="12" r="2.75" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>`
              : `<svg fill="none" viewBox="0 0 24 24"><path d="M4.5 4.5 19.5 19.5M10.6 7.27A9.61 9.61 0 0 1 12 7.17c5.5 0 8.25 4.83 8.25 4.83a13.2 13.2 0 0 1-2.76 3.32M8.28 8.28C5.69 9.56 3.75 12 3.75 12s2.75 5 8.25 5c1.31 0 2.49-.28 3.53-.72M10.1 10.1A2.75 2.75 0 0 0 13.9 13.9" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>`}
          </span>
        </button>
      </div>
      <div class="text-[15px] text-ink">${escapeHtml(account.description || "-")}</div>
      <div class="text-[14px] text-ink-soft">${escapeHtml(account.lastSaved)}</div>
      <div></div>
    `;
    row.addEventListener("click", () => {
      state.selectedAccountId = account.id;
      renderRows(accounts);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedAccountId = account.id;
        renderRows(accounts);
      }
    });
    const toggleButton = row.querySelector("[data-toggle-visibility='true']") as HTMLButtonElement | null;
    toggleButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.revealedAccountIds.has(account.id)) {
        state.revealedAccountIds.delete(account.id);
      } else {
        state.revealedAccountIds.add(account.id);
      }
      void runAction(() => window.api.updateSettings({ revealedAccountIds: [...state.revealedAccountIds] }), "设置失败");
      renderRows(accounts);
    });
    const dragHandle = row.querySelector("[data-drag-handle='true']") as HTMLButtonElement | null;
    dragHandle?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    dragHandle?.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (event.button !== 0) {
        return;
      }
      state.dragPointerId = event.pointerId;
      state.dragAccountId = account.id;
      state.dragOverAccountId = account.id;
      state.dragOverPosition = "after";
      document.body.classList.add("drag-sort-active");
      dragHandle.setPointerCapture(event.pointerId);
      renderRows(accounts);
    });
    dragHandle?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
      }
    });
    rows.appendChild(row);
  });
}

function renderDebug(payload: AppStateDto, settings: AppSettings | null): void {
  const wowAccounts = payload.wowAccounts.length ? payload.wowAccounts.join("、") : "-";
  const loginCandidates = payload.currentSavedAccountCandidates.length ? payload.currentSavedAccountCandidates.join("、") : "-";
  const switchProfile = settings?.battleNetSwitchProfile || "D";
  (document.getElementById("debugState") as HTMLDivElement).innerHTML = `
    <div>Battle.net 环境：${escapeHtml(payload.currentLoginName)}</div>
    <div>当前账号标识：${escapeHtml(payload.currentSavedAccountName || "-")}</div>
    <div>Battle.net 登录候选：${escapeHtml(loginCandidates)}</div>
    <div>注册表摘要：${escapeHtml(payload.currentGameAccount)}</div>
    <div>附加信息：${escapeHtml(wowAccounts)}</div>
    <div>当前切换方案：${escapeHtml(SWITCH_PROFILE_LABELS[switchProfile])}</div>
    <div>账号库数量：${payload.accountCount}</div>
    <div>可导入数量：${payload.importableCount}</div>
    <div>当前权限：${escapeHtml(payload.permissionLabel)}</div>
  `;
  (document.getElementById("debugDirs") as HTMLDivElement).innerHTML = `
    <div>游戏目录：${escapeHtml(payload.gameDirectory || "-")}</div>
    <div>账号库目录：${escapeHtml(payload.libraryDirectory)}</div>
    <div>数据目录：${escapeHtml(payload.dataDirectory)}</div>
  `;
  (document.getElementById("aboutVersion") as HTMLDivElement).textContent = `版本号：v${payload.version}`;
  (document.getElementById("aboutLibraryDir") as HTMLDivElement).textContent = `账号库目录：${payload.libraryDirectory}`;
  (document.getElementById("aboutDataDir") as HTMLDivElement).textContent = `数据目录：${payload.dataDirectory}`;
  (document.getElementById("logLines") as HTMLDivElement).innerHTML = payload.logs.length
    ? payload.logs.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
    : "<div>暂无日志。</div>";
}

function updateSwitchProfileButtons(settings: AppSettings | null): void {
  const active = settings?.battleNetSwitchProfile || "D";
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-switch-profile]");
  buttons.forEach((button) => {
    const profile = button.dataset.switchProfile as AppSettings["battleNetSwitchProfile"] | undefined;
    const isDisabled = button.disabled;
    const isActive = profile === active;
    button.classList.toggle("bg-primary", isActive);
    button.classList.toggle("text-white", isActive);
    button.classList.toggle("shadow-[0_8px_18px_rgba(29,161,242,0.22)]", isActive);
    button.classList.toggle("bg-surface-soft", !isActive);
    button.classList.toggle("text-ink", !isActive);
    if (isDisabled) {
      button.classList.remove("bg-primary", "text-white", "shadow-[0_8px_18px_rgba(29,161,242,0.22)]");
    }
  });
}

function setButtonDisabled(id: string, disabled: boolean): void {
  const element = document.getElementById(id) as HTMLButtonElement | HTMLInputElement | null;
  if (!element) {
    return;
  }
  element.disabled = disabled;
  element.classList.toggle("opacity-50", disabled);
  element.classList.toggle("cursor-not-allowed", disabled);
}

function updateActionStates(): void {
  const hasAccounts = Boolean(state.payload?.accounts.length);
  const hasSelection = Boolean(state.selectedAccountId && hasAccounts);
  const hasDataDir = Boolean(state.payload?.dataDirectory);

  setButtonDisabled("switchBtn", !hasSelection);
  setButtonDisabled("noteBtn", !hasSelection);
  setButtonDisabled("deleteBtn", !hasSelection);
  setButtonDisabled("openDataDirBtn", !hasDataDir);
  setButtonDisabled("clearLogsBtn", !hasDataDir);
}

function toggleSection(sectionId: string): void {
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }
  target.classList.toggle("hidden");
  if (!target.classList.contains("hidden")) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function applyState(payload: AppStateDto, settings?: AppSettings): void {
  state.payload = payload;
  if (settings) {
    state.settings = settings;
    state.revealedAccountIds = new Set(settings.revealedAccountIds || []);
  }
  (document.getElementById("wordmark") as HTMLSpanElement).textContent = payload.appName;
  (document.getElementById("versionLabel") as HTMLSpanElement).textContent = `v${payload.version}`;
  (document.getElementById("gameDirField") as HTMLInputElement).value = payload.gameDirectory || "";
  if (state.settings) {
    (document.getElementById("minimizeToTrayToggle") as HTMLInputElement).checked = state.settings.minimizeToTrayOnClose;
    (document.getElementById("launchAtLoginToggle") as HTMLInputElement).checked = state.settings.launchAtLogin;
    (document.getElementById("minimizeOnLaunchToggle") as HTMLInputElement).checked = state.settings.minimizeOnLaunch;
    (document.getElementById("skipSwitchConfirmToggle") as HTMLInputElement).checked = state.settings.skipSwitchConfirm;
  }
  renderRows(payload.accounts);
  renderDebug(payload, state.settings);
  updateSwitchProfileButtons(state.settings);
  updateActionStates();
  void syncWindowState();
}

async function refreshState(): Promise<void> {
  const [payload, settings] = await Promise.all([
    window.api.getAppState() as Promise<AppStateDto>,
    window.api.getSettings() as Promise<AppSettings>
  ]);
  applyState(payload, settings);
}

async function handleResult(result: OperationResult, title: string): Promise<void> {
  showNotice(result.message, result.ok ? "success" : "error");
  await refreshState();
  if (!result.ok) {
    await showMessage(result.message, title);
  }
}

async function runAction<T>(work: () => Promise<T>, onErrorTitle = "操作失败"): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showNotice(message, "error");
    await showMessage(message, onErrorTitle);
    return null;
  }
}

function bindStaticActions(): void {
  if (state.actionsBound) {
    return;
  }
  state.actionsBound = true;

  (document.getElementById("switchBtn") as HTMLButtonElement).addEventListener("click", async () => {
    if (!state.selectedAccountId || !state.payload) {
      await showMessage("请先选择一个账号。");
      return;
    }
    const target = state.payload.accounts.find((item) => item.id === state.selectedAccountId);
    if (!state.settings?.skipSwitchConfirm) {
      const confirmResult = await askConfirm(
        "确认切换",
        `确认切换到 ${target?.email || state.selectedAccountId} 吗？\n\n程序会先备份当前状态，再关闭 Battle.net / Agent，恢复目标账号并重新启动 Battle.net。`,
        { label: "以后直接切换，不再确认" }
      );
      if (!confirmResult.confirmed) {
        return;
      }
      if (confirmResult.optionChecked) {
        const updatedSettings = await runAction(() => window.api.updateSettings({ skipSwitchConfirm: true }), "设置失败");
        if (!updatedSettings) {
          return;
        }
        state.settings = updatedSettings as AppSettings;
      }
    }
    const result = await runAction(() => window.api.switchAccount(state.selectedAccountId), "切换失败");
    if (result) {
      await handleResult(result, "切换失败");
      if (!result.ok && (result.failureReason === "AccessDenied" || result.failureReason === "StillClosing" || result.failureReason === "Respawned")) {
        const retry = await askConfirm("手动退出后重试", "请先在 Battle.net 中完全退出战网和 Agent。完成后点“确认”，我会立即再重试一次切换。");
        if (retry.confirmed) {
          const retryResult = await runAction(() => window.api.switchAccount(state.selectedAccountId), "切换失败");
          if (retryResult) {
            await handleResult(retryResult, "切换失败");
          }
        }
      }
    }
  });

  (document.getElementById("saveBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const loginCandidates = state.payload?.currentSavedAccountCandidates || [];
    const accountHint = state.payload?.currentSavedAccountName || loginCandidates[0] || "";
    const candidateHint = loginCandidates.length ? `当前检测到的 Battle.net 登录候选：${loginCandidates.join("、")}` : "";
    const result = await askForm({
      title: "保存当前登录",
      hint: ["把当前 Battle.net 登录状态保存到本地账号库。默认预填当前识别到的账号标识，可手动改成邮箱或备注名。", candidateHint].filter(Boolean).join("\n"),
      submitText: "保存",
      fields: [
        {
          name: "accountName",
          label: "账号名称或邮箱",
          value: accountHint,
          placeholder: accountHint ? "" : (loginCandidates[0] || "例如：name@example.com")
        },
        { name: "description", label: "备注", type: "textarea" }
      ]
    });
    if (!result) {
      return;
    }
    const actionResult = await runAction(() => window.api.saveCurrentAccount({
      accountName: result.accountName || "",
      description: result.description || ""
    }), "保存失败");
    if (actionResult) {
      await handleResult(actionResult, "保存失败");
    }
  });

  (document.getElementById("backupBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const selectedPath = await runAction(() => window.api.selectDirectory(state.payload?.libraryDirectory || ""), "选择目录失败");
    if (selectedPath === null) {
      return;
    }
    const result = await runAction(() => window.api.backupLibrary(selectedPath || ""), "导出失败");
    if (result) {
      await handleResult(result, "导出失败");
    }
  });

  (document.getElementById("importBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const selectedPath = await runAction(() => window.api.selectImportSource(state.payload?.dataDirectory || ""), "选择导入源失败");
    if (selectedPath === null) {
      return;
    }
    if (!selectedPath) {
      return;
    }
    const result = await runAction(() => window.api.importLibrary(selectedPath), "导入失败");
    if (result) {
      await handleResult(result, "导入失败");
    }
  });

  (document.getElementById("noteBtn") as HTMLButtonElement).addEventListener("click", async () => {
    if (!state.selectedAccountId || !state.payload) {
      await showMessage("请先选择一个账号。");
      return;
    }
    const current = state.payload.accounts.find((item) => item.id === state.selectedAccountId);
    const result = await askForm({
      title: "修改备注",
      hint: `当前账号：${current?.email || state.selectedAccountId}`,
      submitText: "保存",
      fields: [
        { name: "description", label: "备注", type: "textarea", value: current?.description === "-" ? "" : (current?.description || "") }
      ]
    });
    if (!result) {
      return;
    }
    const actionResult = await runAction(() => window.api.updateAccountNote(state.selectedAccountId, result.description || ""), "修改备注失败");
    if (actionResult) {
      await handleResult(actionResult, "修改备注失败");
    }
  });

  (document.getElementById("deleteBtn") as HTMLButtonElement).addEventListener("click", async () => {
    if (!state.selectedAccountId || !state.payload) {
      await showMessage("请先选择一个账号。");
      return;
    }
    const target = state.payload.accounts.find((item) => item.id === state.selectedAccountId);
    const ok = await askConfirm("确认删除", `确认删除账号 ${target?.email || state.selectedAccountId} 吗？\n\n这个操作会删除本地账号目录。`);
    if (!ok.confirmed) {
      return;
    }
    const result = await runAction(() => window.api.deleteAccount(state.selectedAccountId), "删除失败");
    if (result) {
      await handleResult(result, "删除失败");
    }
  });

  (document.getElementById("pickFolderBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const selectedPath = await runAction(() => window.api.selectDirectory(state.payload?.gameDirectory || ""), "选择目录失败");
    if (selectedPath === null) {
      return;
    }
    if (!selectedPath) {
      return;
    }
    (document.getElementById("gameDirField") as HTMLInputElement).value = selectedPath;
  });

  (document.getElementById("confirmGameDirBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const value = (document.getElementById("gameDirField") as HTMLInputElement).value.trim();
    const settings = await runAction(() => window.api.setGameDirectory(value), "设置失败");
    if (!settings) {
      return;
    }
    showNotice(`安装目录已更新：${settings.gameDirectory || "(空)"}`, "success");
    await refreshState();
  });

  (document.getElementById("autoSearchBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const result = await runAction(() => window.api.autoDetectLauncher(), "识别失败");
    if (!result) {
      return;
    }
    showNotice(result.message, result.ok ? "success" : "error");
    await refreshState();
  });

  (document.getElementById("openLauncherBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const result = await runAction(() => window.api.openLauncher(), "启动失败");
    if (result) {
      await handleResult(result, "启动失败");
    }
  });

  (document.getElementById("refreshStateBtn") as HTMLButtonElement).addEventListener("click", async () => {
    clearNotice();
    await refreshState();
  });

  (document.getElementById("importNewBeeBoxBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const result = await runAction(() => window.api.importFromNewBeeBox(), "导入失败");
    if (result) {
      await handleResult(result, "导入失败");
    }
  });

  (document.getElementById("restoreBackupBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const ok = await askConfirm("确认恢复备份", "确认恢复最近一次推荐备份吗？\n\n程序会先关闭 Battle.net / Agent，再恢复推荐备份并重新启动 Battle.net。");
    if (!ok.confirmed) {
      return;
    }
    const result = await runAction(() => window.api.restoreLatestBackup(), "恢复失败");
    if (result) {
      await handleResult(result, "恢复失败");
    }
  });

  (document.getElementById("backupStateBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const result = await runAction(() => window.api.backupCurrentState(), "备份失败");
    if (result) {
      await handleResult(result, "备份失败");
    }
  });

  (document.getElementById("diagnosticSnapshotBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const result = await askForm({
      title: "诊断快照",
      hint: "请输入本次诊断快照标签。",
      submitText: "保存",
      fields: [
        { name: "label", label: "快照标签", value: "manual-check" }
      ]
    });
    if (!result) {
      return;
    }
    const actionResult = await runAction(() => window.api.takeDiagnosticSnapshot(result.label || "manual-check"), "诊断快照失败");
    if (actionResult) {
      await handleResult(actionResult, "诊断快照失败");
    }
  });

  (document.getElementById("compareDiagnosticsBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const result = await runAction(() => window.api.compareLatestDiagnostics(), "对比失败");
    if (result) {
      await handleResult(result, "对比失败");
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-switch-profile]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) {
        return;
      }
      const profile = button.dataset.switchProfile as AppSettings["battleNetSwitchProfile"] | undefined;
      if (!profile || state.settings?.battleNetSwitchProfile === profile) {
        return;
      }
      const result = await runAction(() => window.api.updateSettings({ battleNetSwitchProfile: profile }), "切换方案设置失败");
      if (!result) {
        return;
      }
      showNotice(`已切换到 ${SWITCH_PROFILE_LABELS[profile]}`, "success");
      await refreshState();
    });
  });

  (document.getElementById("openDataDirBtn") as HTMLButtonElement).addEventListener("click", async () => {
    if (!state.payload) {
      return;
    }
    await window.api.openDirectory(state.payload.dataDirectory);
  });

  (document.getElementById("clearLogsBtn") as HTMLButtonElement).addEventListener("click", async () => {
    if (!state.payload) {
      return;
    }
    const logPath = `${state.payload.dataDirectory}\\logs\\main.log`;
    const ok = await askConfirm("确认清空日志", `即将清空以下日志文件内容：\n${logPath}\n\n确认继续吗？`);
    if (!ok.confirmed) {
      return;
    }
    const result = await runAction(() => window.api.clearLogs(), "清空日志失败");
    if (result) {
      showNotice(result.message, "success");
      await refreshState();
    }
  });

  (document.getElementById("minimizeToTrayToggle") as HTMLInputElement).addEventListener("change", async (event) => {
    const nextValue = (event.currentTarget as HTMLInputElement).checked;
    const result = await runAction(() => window.api.updateSettings({ minimizeToTrayOnClose: nextValue }), "设置失败");
    if (!result) {
      return;
    }
    await refreshState();
  });

  (document.getElementById("launchAtLoginToggle") as HTMLInputElement).addEventListener("change", async (event) => {
    const nextValue = (event.currentTarget as HTMLInputElement).checked;
    const result = await runAction(() => window.api.updateSettings({ launchAtLogin: nextValue }), "设置失败");
    if (!result) {
      return;
    }
    await refreshState();
  });

  (document.getElementById("minimizeOnLaunchToggle") as HTMLInputElement).addEventListener("change", async (event) => {
    const nextValue = (event.currentTarget as HTMLInputElement).checked;
    const result = await runAction(() => window.api.updateSettings({ minimizeOnLaunch: nextValue }), "设置失败");
    if (!result) {
      return;
    }
    await refreshState();
  });

  (document.getElementById("skipSwitchConfirmToggle") as HTMLInputElement).addEventListener("change", async (event) => {
    const nextValue = (event.currentTarget as HTMLInputElement).checked;
    const result = await runAction(() => window.api.updateSettings({ skipSwitchConfirm: nextValue }), "设置失败");
    if (!result) {
      return;
    }
    await refreshState();
  });

  (document.getElementById("settingsLink") as HTMLButtonElement).addEventListener("click", () => toggleSection("settingsSection"));
  (document.getElementById("debugLink") as HTMLButtonElement).addEventListener("click", () => toggleSection("debugSection"));
  document.querySelectorAll<HTMLAnchorElement>("[data-external-url]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      const targetUrl = link.dataset.externalUrl;
      if (!targetUrl) {
        return;
      }
      await window.api.openExternal(targetUrl);
    });
  });
  bindPluginTooltips();

  (document.getElementById("windowMinBtn") as HTMLButtonElement).addEventListener("click", async () => {
    await window.api.minimizeWindow();
  });
  (document.getElementById("windowMaxBtn") as HTMLButtonElement).addEventListener("click", async () => {
    const next = await runAction(() => window.api.toggleMaximizeWindow(), "窗口操作失败");
    if (!next) {
      return;
    }
    (document.getElementById("windowMaxBtn") as HTMLButtonElement).setAttribute("aria-label", next.isMaximized ? "还原窗口" : "最大化");
  });
  (document.getElementById("windowCloseBtn") as HTMLButtonElement).addEventListener("click", async () => {
    await window.api.closeWindow();
  });

  document.addEventListener("pointermove", (event) => {
    if (!state.dragAccountId || state.dragPointerId !== event.pointerId) {
      return;
    }
    const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest("[data-account-id]") as HTMLElement | null;
    if (!target) {
      return;
    }
    const accountId = target.dataset.accountId || "";
    if (!accountId || accountId === state.dragAccountId) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const nextPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (state.dragOverAccountId !== accountId || state.dragOverPosition !== nextPosition) {
      state.dragOverAccountId = accountId;
      state.dragOverPosition = nextPosition;
      if (state.payload) {
        renderRows(state.payload.accounts);
      }
    }
  });

  document.addEventListener("pointerup", (event) => {
    if (!state.dragAccountId || state.dragPointerId !== event.pointerId) {
      return;
    }
    const dragAccountId = state.dragAccountId;
    const dragOverAccountId = state.dragOverAccountId;
    const dragOverPosition = state.dragOverPosition;
    const shouldCommit = Boolean(state.dragOverAccountId && state.dragOverAccountId !== state.dragAccountId);
    const accounts = state.payload?.accounts || [];
    resetDragState();
    renderRows(accounts);
    if (shouldCommit) {
      void commitAccountReorder(dragAccountId, dragOverAccountId, dragOverPosition);
    }
  });

  document.addEventListener("pointercancel", () => {
    if (!state.dragAccountId) {
      return;
    }
    const accounts = state.payload?.accounts || [];
    resetDragState();
    renderRows(accounts);
  });

  const aboutDialog = document.getElementById("aboutDialog") as HTMLDialogElement;
  (document.getElementById("aboutLink") as HTMLButtonElement).addEventListener("click", () => aboutDialog.showModal());
  (document.getElementById("closeAboutTop") as HTMLButtonElement).addEventListener("click", () => aboutDialog.close());
  (document.getElementById("closeAboutBottom") as HTMLButtonElement).addEventListener("click", () => aboutDialog.close());

  const formDialog = document.getElementById("formDialog") as HTMLDialogElement;
  const formEl = document.getElementById("formDialogForm") as HTMLFormElement;
  (document.getElementById("formDialogClose") as HTMLButtonElement).addEventListener("click", () => {
    closeDialog(formDialog);
    state.formResolve?.resolve(null);
    state.formResolve = null;
  });
  (document.getElementById("formDialogCancel") as HTMLButtonElement).addEventListener("click", () => {
    closeDialog(formDialog);
    state.formResolve?.resolve(null);
    state.formResolve = null;
  });
  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.formResolve) {
      closeDialog(formDialog);
      return;
    }
    const data: Record<string, string> = {};
    for (const field of state.formResolve.fields) {
      const element = formEl.querySelector(`[data-field="${field.name}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
      data[field.name] = element?.value.trim() || "";
    }
    state.formResolve.resolve(data);
    state.formResolve = null;
    closeDialog(formDialog);
  });

  const confirmDialog = document.getElementById("confirmDialog") as HTMLDialogElement;
  (document.getElementById("confirmDialogCancel") as HTMLButtonElement).addEventListener("click", () => {
    closeDialog(confirmDialog);
    state.confirmResolve?.({ confirmed: false, optionChecked: false });
    state.confirmResolve = null;
  });
  (document.getElementById("confirmDialogOk") as HTMLButtonElement).addEventListener("click", () => {
    const optionCheckbox = document.getElementById("confirmDialogOptionCheckbox") as HTMLInputElement;
    closeDialog(confirmDialog);
    state.confirmResolve?.({ confirmed: true, optionChecked: optionCheckbox.checked });
    state.confirmResolve = null;
  });

  const messageDialog = document.getElementById("messageDialog") as HTMLDialogElement;
  (document.getElementById("messageDialogOk") as HTMLButtonElement).addEventListener("click", () => {
    closeDialog(messageDialog);
    state.messageResolve?.(true);
    state.messageResolve = null;
  });

  (document.getElementById("gameDirField") as HTMLInputElement).addEventListener("input", () => {
    const currentValue = state.payload?.gameDirectory || "";
    const nextValue = (document.getElementById("gameDirField") as HTMLInputElement).value.trim();
    (document.getElementById("confirmGameDirBtn") as HTMLButtonElement).classList.toggle("hidden", !nextValue || nextValue === currentValue);
  });
}

async function bootstrap(): Promise<void> {
  bindStaticActions();
  clearNotice();
  await refreshState();
}

void bootstrap().catch(async (error) => {
  console.error(error);
  showNotice(`加载失败：${error instanceof Error ? error.message : String(error)}`, "error");
  await showMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`, "启动失败");
});
