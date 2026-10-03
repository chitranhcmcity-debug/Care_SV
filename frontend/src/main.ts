import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// A refresh always starts from the top instead of restoring the old scroll position.
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
