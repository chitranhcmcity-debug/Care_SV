import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Làm mới luôn bắt đầu từ đầu trang thay vì khôi phục vị trí cuộn cũ.
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
