import Vue from 'vue';
import Router from 'vue-router';
import HomeVue from './views/Home.vue';

Vue.use(Router)
export default new Router({
    mode: 'history',
    routes: [
        { path: '/', redirect: { name: 'home' } },
        { path: '/home', name: 'home', component: HomeVue }
    ]
});