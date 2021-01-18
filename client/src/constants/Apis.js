export const LOCAL_URL = 'http://localhost:8000/'
export const PUBLIC_URL = 'https://dinemateapp.herokuapp.com/'
export const CUSTOMER_APP_URL = 'http://192.168.1.101:3000/'
export const BASE_URL = LOCAL_URL

export const API_ENDPOINTS = {
    admin: {
        login: 'admin/login',
        forgotPassword: 'admin/forgotPassword',
        createPassword: 'admin/createPassword',
        addRestuarant: 'admin/addRestuarant',
        generateQrs: 'admin/generateQrs',
        getAllRestaurants: 'admin/getAllRestaurants',
        getExistingQrs: 'admin/getExistingQrs'
    }
}