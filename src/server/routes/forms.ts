import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';

type ExampleFormValues = {
  message?: string;
};

export const forms = new Hono();

forms.post('/example-submit', async (c) => {
  const { message } = await c.req.json<ExampleFormValues>();
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  return c.json<UiResponse>(
    {
      showToast: {
        text: trimmedMessage
          ? `Moderator note saved: ${trimmedMessage}`
          : 'Moderator note submitted with no message',
        appearance: 'success',
      },
    },
    200
  );
});
