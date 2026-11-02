/* Sparkling Alice quote form: confirmed Sheets write, then existing owner notification. */
(function () {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycbzeXBsZ4DAXypPCE8fU9LfBPo02kXBPPGd-MdOfQ_bcGxMIPGR1J-YFeusjqL5EnR2L/exec';
  const attempts = new WeakMap();
  const inFlight = new WeakSet();

  async function requestJson(url, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST', body, credentials: 'omit',
        redirect: 'follow', signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error('The server did not confirm receipt.');
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  window.sendQuote = async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (inFlight.has(form) || !form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    let status = form.querySelector('#quoteStatus');
    if (!status) {
      status = document.createElement('p');
      status.id = 'quoteStatus';
      status.className = 'form-note';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      button.insertAdjacentElement('afterend', status);
    }
    const fields = new FormData(form);
    if (fields.get('botcheck')) return;
    const payload = {};
    ['name', 'phone', 'email', 'vehicle', 'service', 'message'].forEach(key => {
      payload[key] = String(fields.get(key) || '').trim();
    });
    payload.website = '';
    const fingerprint = JSON.stringify(payload);
    let attempt = attempts.get(form);
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = { fingerprint, id: crypto.randomUUID(), ownerNotified: false };
      attempts.set(form, attempt);
    }
    payload.submissionId = attempt.id;

    inFlight.add(form);
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    const buttonLabel = button.textContent;
    button.textContent = 'SENDING...';
    status.textContent = 'Sending your enquiry...';
    status.removeAttribute('data-lead-id');

    try {
      // URLSearchParams uses a simple form POST. Success requires readable JSON;
      // opaque no-cors responses must never be treated as successful delivery.
      const result = await requestJson(endpoint, new URLSearchParams(payload), 45000);
      status.dataset.leadId = result.leadId;
      const isTest = form.dataset.automationTest === 'true';
      let notificationFailed = false;

      if (!isTest && fields.get('access_key') && !attempt.ownerNotified) {
        try {
          await requestJson('https://api.web3forms.com/submit', fields, 15000);
          attempt.ownerNotified = true;
        } catch (error) {
          notificationFailed = true;
          console.warn('Quote saved, but the existing email notification was not confirmed.');
        }
      }

      form.reset();
      attempts.delete(form);
      if (isTest) {
        status.textContent = 'TEST PASSED: the tracker confirmed enquiry ' +
          result.leadId + '. No notification email was sent.';
      } else if (notificationFailed) {
        status.textContent = 'Your quote request has been saved. The email alert could not be confirmed. ' +
          'For a prompt response, please call 0478 525 477.';
      } else {
        status.textContent = 'Thank you! Your quote request has been received. Sparkling Alice will be in touch.';
      }
    } catch (error) {
      // Keep the fields and same request ID for a safe retry after a timeout.
      status.textContent = 'We could not confirm your enquiry was received. ' +
        'Your details are still here: please try again or call 0478 525 477.';
    } finally {
      inFlight.delete(form);
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.textContent = buttonLabel;
    }
  };
}());

