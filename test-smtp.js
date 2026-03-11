import { sendEmail } from './utils/sendEmail.js';

(async () => {
    const success = await sendEmail(
        'shila@novainternationaldesigns.com',
        'Test Email',
        '<h1>This is a test from Resend - shila</h1>',
        true
    );

    console.log(`✅ Email sent to ${to}: ${response.data?.id}`);
})();