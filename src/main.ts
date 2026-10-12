import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import router from './router';
import App from './App.vue';
import { queryClient } from './lib/query-client';
import { keysChangedBy, markChanged } from './lib/query-keys';
import { registerMutationListener } from './api/client';
import './assets/theme.css';


const app = createApp(App);

app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
// Safety net: any successful write drops or marks stale the cached data it may
// have changed, even from a page that does not refresh the cache itself.
registerMutationListener((url) => markChanged(queryClient, keysChangedBy(url)));
app.use(router);

app.mount('#app');
