import * as SecureStore from 'expo-secure-store';

export const getUserId = () => SecureStore.getItemAsync('user_id');
export const getFullname = () => SecureStore.getItemAsync('user_fullname');
export const getMoodleUsername = () => SecureStore.getItemAsync('moodle_username');
export const getMoodleDomain = () => SecureStore.getItemAsync('moodle_domain');
export const getMoodleToken = () => SecureStore.getItemAsync('moodle_token');
export const getMoodleSiteUrl = () => SecureStore.getItemAsync('moodle_site_url');
