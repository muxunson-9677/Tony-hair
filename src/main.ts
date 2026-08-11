import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { createAppRouter } from './router'
import { dragRailDirective } from './ui/dragRail'
import { tactileDirective } from './ui/tactile'
import './styles.css'

const app = createApp(App)

app.use(createPinia())
app.use(createAppRouter())
app.directive('drag-rail', dragRailDirective)
app.directive('tactile', tactileDirective)
app.mount('#app')
