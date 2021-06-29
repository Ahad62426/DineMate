import { switchMap } from 'rxjs/operators'
import { ofType } from 'redux-observable'

import { customisedAction } from '../../actions'
import { generalizedEpic } from '../generalizedEpic'
import {
  SET_ORDER,
  API_ENDPOINTS,
  SUBMIT_ORDER_ITEM,
  SUBMIT_ORDER_ITEM_FAILED
} from '../../../constants'
import { removeItem, setItem } from '../../../helpers'

export class submitOrderEpic {
  static submitOrder = action$ =>
    action$.pipe(
      ofType(SUBMIT_ORDER_ITEM),
      switchMap(
        async ({ payload: obj}) => {
          return generalizedEpic(
            'post', 
            API_ENDPOINTS.customer.submitOrder,
            obj,
            (resObj) => {
              removeItem('cartMenu')
              return customisedAction(SET_ORDER, { orderDetails: resObj.body, toast: { message: resObj.message, type: 'success' }, cartMenu: [] })
            },
            SUBMIT_ORDER_ITEM_FAILED
          )
        }
      )
    )
}
