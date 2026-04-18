import { describe, expect, it } from 'vitest';

import { renderAlertText } from '../../src/shared/alert-text-renderer.js';
import { createAlertQueueItem } from '../support/test-utils.js';

describe('renderAlertText', () => {
  it('renders cheer alerts with the requested spoken phrasing', () => {
    const text = renderAlertText(
      createAlertQueueItem({
        alertType: 'cheer',
        payload: { userName: 'tester', message: 'vielen Dank fuer den Support' }
      })
    );

    expect(text).toBe('Von tester. vielen Dank fuer den Support');
  });

  it('supports the subscrition spelling variant for spoken phrasing', () => {
    const text = renderAlertText(
      createAlertQueueItem({
        alertType: 'subscrition',
        payload: { userName: 'tester', message: 'hat gerade abonniert' }
      })
    );

    expect(text).toBe('Von tester. hat gerade abonniert');
  });

  it('keeps the default phrasing for other alert types', () => {
    const text = renderAlertText(
      createAlertQueueItem({
        alertType: 'follow',
        payload: { userName: 'tester', message: 'ist jetzt dabei' }
      })
    );

    expect(text).toBe('tester: ist jetzt dabei');
  });
});
