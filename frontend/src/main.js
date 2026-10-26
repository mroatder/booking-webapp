import './style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { router } from './router'
import { i18n } from './locales'

import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';

import DatePicker from './components/common/DatePicker.vue';
import TimePicker from './components/common/TimePicker.vue';

const app = createApp(App)

app.component('VueDatePicker', VueDatePicker);
app.component('DatePicker', DatePicker);
app.component('TimePicker', TimePicker);

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
