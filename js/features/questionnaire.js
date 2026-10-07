(function () {
    'use strict';

    const timers = new Map();
    const typingQuestionnaires = new Set();
    let currentType = 'short';

    const $ = (id) => document.getElementById(id);
    const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));
    const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    const typeLabels = { short: '简答', single: '单选', multiple: '多选' };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function uniqueOptions(raw) {
        const seen = new Set();
        const options = [];
        String(raw || '').split(/\r?\n/).forEach(line => {
            const option = line.trim();
            if (!option || seen.has(option)) return;
            seen.add(option);
            options.push(option);
        });
        return options;
    }

    function shuffled(values) {
        const result = values.slice();
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    function getAvailableReplyCards() {
        const disabledItems = (() => {
            try { return new Set(JSON.parse(localStorage.getItem('disabledReplyItems') || '[]')); }
            catch (e) { return new Set(); }
        })();
        const disabledGroupItems = new Set();
        (window.customReplyGroups || []).forEach(group => {
            if (group && group.disabled && Array.isArray(group.items)) {
                group.items.forEach(item => disabledGroupItems.add(item));
            }
        });
        const source = (typeof customReplies !== 'undefined' && Array.isArray(customReplies))
            ? customReplies
            : (Array.isArray(window._customReplies) ? window._customReplies : []);
        const seen = new Set();
        return source.reduce((pool, item) => {
            const text = String(item || '').trim();
            if (text && !seen.has(text) && !disabledItems.has(item) && !disabledItems.has(text) && !disabledGroupItems.has(item) && !disabledGroupItems.has(text)) {
                seen.add(text);
                pool.push(text);
            }
            return pool;
        }, []);
    }

    function choosePlannedAnswers(type, options, choiceMin, choiceMax) {
        if (type === 'short') return shuffled(getAvailableReplyCards()).slice(0, 3);
        if (type === 'single') return [options[Math.floor(Math.random() * options.length)]];
        const count = randomInt(choiceMin, choiceMax);
        return shuffled(options).slice(0, count);
    }

    function setType(type) {
        currentType = ['short', 'single', 'multiple'].includes(type) ? type : 'short';
        document.querySelectorAll('.questionnaire-type-btn').forEach(btn => {
            const active = btn.dataset.type === currentType;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        const hasOptions = currentType !== 'short';
        const optionsField = $('questionnaire-options-field');
        const multiRange = $('questionnaire-multi-range');
        const shortNote = $('questionnaire-short-note');
        if (optionsField) optionsField.hidden = !hasOptions;
        if (multiRange) multiRange.hidden = currentType !== 'multiple';
        if (shortNote) shortNote.hidden = currentType !== 'short';
        updateOptionCount();
    }

    function updateOptionCount() {
        const options = uniqueOptions($('questionnaire-options')?.value);
        const rawCount = String($('questionnaire-options')?.value || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean).length;
        const duplicates = Math.max(0, rawCount - options.length);
        const hint = $('questionnaire-option-count');
        if (hint) hint.textContent = `${options.length} 个有效选项${duplicates ? `，${duplicates} 个重复项将合并` : ''}`;
        const minInput = $('questionnaire-choice-min');
        const maxInput = $('questionnaire-choice-max');
        if (!minInput || !maxInput) return;
        const limit = Math.max(1, options.length);
        minInput.max = String(limit);
        maxInput.max = String(limit);
        if (Number(minInput.value) > limit) minInput.value = String(limit);
        if (Number(maxInput.value) > limit || Number(maxInput.value) < 1) maxInput.value = String(limit);
        if (Number(maxInput.value) < Number(minInput.value)) maxInput.value = minInput.value;
    }

    function resetForm() {
        currentType = 'short';
        if ($('questionnaire-question')) $('questionnaire-question').value = '';
        if ($('questionnaire-options')) $('questionnaire-options').value = '';
        if ($('questionnaire-choice-min')) $('questionnaire-choice-min').value = '1';
        if ($('questionnaire-choice-max')) $('questionnaire-choice-max').value = '1';
        if ($('questionnaire-delay-min')) $('questionnaire-delay-min').value = '5';
        if ($('questionnaire-delay-max')) $('questionnaire-delay-max').value = '15';
        setType('short');
    }

    function open(prefill) {
        resetForm();
        if (prefill) {
            setType(prefill.type);
            $('questionnaire-question').value = prefill.question || '';
            $('questionnaire-options').value = (prefill.options || []).join('\n');
            $('questionnaire-choice-min').value = String(prefill.choiceMin || 1);
            $('questionnaire-choice-max').value = String(prefill.choiceMax || Math.max(1, (prefill.options || []).length));
            $('questionnaire-delay-min').value = String(prefill.delayMin || 5);
            $('questionnaire-delay-max').value = String(prefill.delayMax || 15);
            updateOptionCount();
        }
        const collapsed = $('collapsed-extras-panel');
        if (collapsed) collapsed.style.display = 'none';
        $('collapse-expand-btn')?.classList.remove('open');
        if (typeof showModal === 'function') showModal($('questionnaire-modal'), $('questionnaire-question'));
    }

    function close() {
        if (typeof hideModal === 'function') hideModal($('questionnaire-modal'));
    }

    function validateAndBuild() {
        const question = String($('questionnaire-question')?.value || '').trim();
        if (!question) {
            showNotification('请输入问卷题目', 'warning');
            $('questionnaire-question')?.focus();
            return null;
        }

        const options = currentType === 'short' ? [] : uniqueOptions($('questionnaire-options')?.value);
        if (currentType !== 'short' && options.length < 2) {
            showNotification('单选和多选至少需要两个有效选项', 'warning');
            $('questionnaire-options')?.focus();
            return null;
        }

        const cards = currentType === 'short' ? getAvailableReplyCards() : [];
        if (currentType === 'short' && cards.length < 3) {
            showNotification(`当前只有 ${cards.length} 条可用字卡，简答问卷至少需要3条`, 'warning', 4200);
            return null;
        }

        const delayMin = clampInt($('questionnaire-delay-min')?.value, 1, 120);
        const delayMax = clampInt($('questionnaire-delay-max')?.value, 1, 120);
        $('questionnaire-delay-min').value = String(delayMin);
        $('questionnaire-delay-max').value = String(delayMax);
        if (delayMin > delayMax) {
            showNotification('最短回复时间不能大于最长回复时间', 'warning');
            return null;
        }

        let choiceMin = 1;
        let choiceMax = 1;
        if (currentType === 'multiple') {
            choiceMin = clampInt($('questionnaire-choice-min')?.value, 1, options.length);
            choiceMax = clampInt($('questionnaire-choice-max')?.value, 1, options.length);
            $('questionnaire-choice-min').value = String(choiceMin);
            $('questionnaire-choice-max').value = String(choiceMax);
            if (choiceMin > choiceMax) {
                showNotification('最少选择数不能大于最多选择数', 'warning');
                return null;
            }
        }

        const rawOptionCount = String($('questionnaire-options')?.value || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean).length;
        if (currentType !== 'short' && rawOptionCount > options.length) {
            showNotification(`已自动合并 ${rawOptionCount - options.length} 个重复选项`, 'info', 2400);
        }

        return { type: currentType, question, options, choiceMin, choiceMax, delayMin, delayMax };
    }

    function send() {
        const config = validateAndBuild();
        if (!config) return;
        const actualDelaySec = randomInt(config.delayMin, config.delayMax);
        const now = Date.now();
        const questionnaire = {
            ...config,
            status: 'pending',
            createdAt: now,
            dueAt: now + actualDelaySec * 1000,
            actualDelaySec,
            plannedAnswers: choosePlannedAnswers(config.type, config.options, config.choiceMin, config.choiceMax),
            answers: [],
            answeredAt: null
        };
        const message = {
            id: now + Math.floor(Math.random() * 1000),
            sender: 'user',
            text: config.question,
            timestamp: new Date(now),
            status: 'sent',
            favorited: false,
            note: null,
            type: 'questionnaire',
            questionnaire
        };
        addMessage(message);
        playSound('send');
        schedule(message);
        close();
        resetForm();
    }

    function showTyping(messageId) {
        typingQuestionnaires.add(String(messageId));
        if (!settings.typingIndicatorEnabled) return;
        const wrapper = $('typing-indicator-wrapper');
        const label = $('typing-indicator-label');
        const avatar = $('typing-indicator-avatar');
        if (label) label.textContent = (settings.partnerName || '对方') + ' 正在填写问卷';
        if (avatar && DOMElements?.partner?.avatar) avatar.innerHTML = DOMElements.partner.avatar.innerHTML;
        if (wrapper) {
            if (typeof positionTypingIndicator === 'function') positionTypingIndicator();
            wrapper.style.display = 'block';
        }
    }

    function hideTyping(messageId) {
        typingQuestionnaires.delete(String(messageId));
        if (typingQuestionnaires.size > 0 || window._pendingReplyTimer) return;
        const wrapper = $('typing-indicator-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    }

    function complete(messageId) {
        cancel(messageId, false);
        const message = messages.find(item => String(item.id) === String(messageId));
        if (!message || message.type !== 'questionnaire' || !message.questionnaire || message.questionnaire.status === 'answered') return;
        const questionnaire = message.questionnaire;
        const answers = Array.isArray(questionnaire.plannedAnswers) ? questionnaire.plannedAnswers.filter(Boolean) : [];
        if (!answers.length) {
            console.warn('[questionnaire] 没有可揭示的预选答案:', messageId);
            questionnaire.status = 'error';
            questionnaire.error = '回答生成失败';
        } else {
            questionnaire.answers = answers;
            questionnaire.status = 'answered';
            questionnaire.answeredAt = Date.now();
            delete questionnaire.plannedAnswers;
            message.status = 'read';
        }
        hideTyping(messageId);
        if (typeof renderMessages === 'function') renderMessages(false);
        if (typeof throttledSaveData === 'function') throttledSaveData();
        if (questionnaire.status === 'answered') {
            playSound('message');
            showNotification(`${settings.partnerName || '对方'}已回答问卷`, 'success', 2400);
            if (typeof window._sendPartnerNotification === 'function') {
                window._sendPartnerNotification(settings.partnerName || '对方', `已回答问卷：${questionnaire.question}`);
            }
        }
    }

    function schedule(message) {
        if (!message || !message.questionnaire || message.questionnaire.status !== 'pending') return;
        cancel(message.id, false);
        const remaining = Number(message.questionnaire.dueAt) - Date.now();
        if (!Number.isFinite(remaining) || remaining <= 0) {
            complete(message.id);
            return;
        }
        const timerInfo = {};
        timerInfo.answer = setTimeout(() => complete(message.id), remaining);
        const typingDelay = remaining - Math.min(2000, Math.max(600, remaining * 0.25));
        timerInfo.typing = setTimeout(() => showTyping(message.id), Math.max(0, typingDelay));
        timers.set(String(message.id), timerInfo);
    }

    function cancel(messageId, hideIndicator = true) {
        const info = timers.get(String(messageId));
        if (info) {
            clearTimeout(info.answer);
            clearTimeout(info.typing);
            timers.delete(String(messageId));
        }
        if (hideIndicator) hideTyping(messageId);
    }

    function restorePending() {
        Array.from(timers.keys()).forEach(id => cancel(id));
        messages.filter(message => message.type === 'questionnaire' && message.questionnaire?.status === 'pending').forEach(schedule);
    }

    function formatAnswerTime(timestamp) {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function createMessageElement(message) {
        const questionnaire = message.questionnaire || {};
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper sent questionnaire-message-wrapper';
        wrapper.dataset.id = message.id;
        wrapper.dataset.msgId = message.id;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content-wrapper';

        const actions = document.createElement('div');
        actions.className = 'questionnaire-card-actions';
        actions.innerHTML = `<button class="meta-action-btn delete-btn" title="删除问卷"><i class="fas fa-trash-alt"></i></button>`;

        const optionsHtml = questionnaire.type === 'short' ? '' : `
            <div class="questionnaire-card-options">
                ${(questionnaire.options || []).map((option, index) => `<div class="questionnaire-card-option"><span>${index + 1}.</span><span>${escapeHtml(option)}</span></div>`).join('')}
            </div>`;
        const answered = questionnaire.status === 'answered';
        const answersHtml = answered ? `
            <div class="questionnaire-card-answers">
                ${(questionnaire.answers || []).map(answer => `<div class="questionnaire-card-answer"><i class="fas fa-check-circle"></i><span>${escapeHtml(answer)}</span></div>`).join('')}
            </div>` : '';
        const statusHtml = answered
            ? `<div class="questionnaire-card-status answered"><i class="fas fa-check-double"></i><span>${escapeHtml(settings.partnerName || '对方')}已回答${questionnaire.answeredAt ? ` · ${formatAnswerTime(questionnaire.answeredAt)}` : ''}</span><button class="questionnaire-repeat-btn" type="button">重新发起</button></div>`
            : questionnaire.status === 'error'
                ? `<div class="questionnaire-card-status"><i class="fas fa-exclamation-circle"></i><span>${escapeHtml(questionnaire.error || '回答生成失败')}</span><button class="questionnaire-repeat-btn" type="button">重新发起</button></div>`
                : `<div class="questionnaire-card-status"><span class="questionnaire-wait-dot"></span><span>等待回答 · ${questionnaire.delayMin || 1}–${questionnaire.delayMax || 1}秒内</span><button class="questionnaire-repeat-btn" type="button">重新发起</button></div>`;

        const card = document.createElement('div');
        card.className = `questionnaire-card ${answered ? 'is-answered' : 'is-pending'}`;
        card.innerHTML = `
            <div class="questionnaire-card-head"><span aria-hidden="true">👑</span><span>问卷调查</span><span class="questionnaire-card-type">${escapeHtml(typeLabels[questionnaire.type] || '问卷')}</span></div>
            <div class="questionnaire-card-body">
                <div class="questionnaire-card-question">${escapeHtml(questionnaire.question || message.text || '')}</div>
                ${optionsHtml}${answersHtml}${statusHtml}
            </div>`;
        contentWrapper.append(actions, card);
        wrapper.appendChild(contentWrapper);
        return wrapper;
    }

    function bindEvents() {
        $('questionnaire-btn')?.addEventListener('click', () => open());
        $('questionnaire-btn-extra')?.addEventListener('click', () => open());
        $('questionnaire-cancel')?.addEventListener('click', close);
        $('questionnaire-send')?.addEventListener('click', send);
        $('questionnaire-options')?.addEventListener('input', updateOptionCount);
        $('questionnaire-choice-min')?.addEventListener('input', () => {
            const min = Number($('questionnaire-choice-min').value);
            if (Number($('questionnaire-choice-max').value) < min) $('questionnaire-choice-max').value = String(min);
        });
        document.querySelectorAll('.questionnaire-type-btn').forEach(btn => btn.addEventListener('click', () => setType(btn.dataset.type)));
        document.addEventListener('click', event => {
            const repeatButton = event.target.closest('.questionnaire-repeat-btn');
            if (!repeatButton) return;
            event.preventDefault();
            event.stopPropagation();
            const wrapper = repeatButton.closest('.questionnaire-message-wrapper');
            const source = messages.find(message => String(message.id) === String(wrapper?.dataset.id));
            if (source?.questionnaire) open(source.questionnaire);
        });
    }

    window.QuestionnaireFeature = { open, send, schedule, cancel, restorePending, createMessageElement };
    window.renderQuestionnaireMessage = createMessageElement;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEvents, { once: true });
    else bindEvents();
})();
