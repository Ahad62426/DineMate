import { combineEpics } from 'redux-observable'
import { loginEpic } from './admin/loginEpic'
import { createPasswordEpic } from './admin/createPasswordEpic'
import { getAllRestaurantsEpic } from './admin/getAllRestaurantsEpic'
import { addRestaurantEpic } from './admin/addRestaurantEpic'
import { generateQrsEpic } from './admin/generateQrsEpic'
import { getExistingQrsEpic } from './admin/getExistingQrsEpic'

export const epics = combineEpics(
    loginEpic.login,
    createPasswordEpic.createPassword,
    getAllRestaurantsEpic.getAllRestaurants,
    addRestaurantEpic.addRestaurant,
    generateQrsEpic.generateQrs,
    getExistingQrsEpic.getExistingQrs
)
