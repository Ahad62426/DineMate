import { 
  SET_TOAST, RESET_TOAST, SET_TOAST_DISMISSING,
  GET_ALL_RESTAURANTS_FAILURE,
  GET_MENU_FAILURE,
  GET_MENU,
  GET_RESTAURANT_DETAILS,
  GET_RESTAURANT_DETAILS_SUCCESS,
  GET_RESTAURANT_DETAILS_FAILURE,
  SET_ORDER,
  INITIALIZE_ORDER_FAILURE,
  SIGN_IN,
  SET_SESSION,
  SIGN_IN_FAILURE
} from '../../constants'

export default (state = { toast: null, toastSetDismiss: false }, { type, payload }) => {
  switch (type) {
    case SET_TOAST:
      return { ...state, toast: payload }
    case RESET_TOAST:
      return { ...state, toast: null }
    case SET_TOAST_DISMISSING:
      return { ...state, toastSetDismiss: payload }
    case SIGN_IN:
      return { ...state, toastSetDismiss: true, toast: { message: 'Singing You In!', type: 'success' }}
    case SET_SESSION:
      return { ...state, toastSetDismiss: true }
    case SIGN_IN_FAILURE:
      return { ...state, toastSetDismiss: true, toast: payload }
    case GET_ALL_RESTAURANTS_FAILURE:
      return { ...state, toastSetDismiss: true, toast: payload }
    case GET_MENU_FAILURE:
      return { ...state, toastSetDismiss: true, toast: payload }
    case GET_RESTAURANT_DETAILS:
      return { ...state, toastSetDismiss: true, toast: { message: 'Fetching restaurant data', type: 'success' }}
    case GET_RESTAURANT_DETAILS_SUCCESS:
      return { ...state, toastSetDismiss: true }
    case GET_RESTAURANT_DETAILS_FAILURE:
      return { ...state, toastSetDismiss: true, toast: payload }
    case SET_ORDER:
      return { ...state, toast: payload.toast }
    case INITIALIZE_ORDER_FAILURE:
      return { ...state, toast: payload }
    default:
      return state
  }
}
