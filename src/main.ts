import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { createAppRouter } from './router'
import './styles.css'
import './styles/apple-light-foundations.css'
import './styles/apple-light-pages.css'

const app = createApp(App)

app.use(createPinia())
app.use(createAppRouter())
app.mount('#app')
