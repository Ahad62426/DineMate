import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import { customisedAction } from '../../../redux/actions'
import { GET_EXISTING_QRS, PER_PAGE_COUNTS } from '../../../constants'

import { Button, Input } from '../../../components'

import TablesList from './TablesList'
import { Pagination } from '../../../components/Pagination'

function Tables(props) {

  const [filterKey, setfilterKey] = useState('')
  const [currentIndex, setcurrentIndex] = useState(1)

  const fetchingQrs = useSelector(({ restaurantReducer }) => restaurantReducer.fetchingQrs)
  const qrs = useSelector(({ restaurantReducer }) => restaurantReducer.qrs)
  const admin = useSelector(({ sessionReducer }) => sessionReducer.admin)
  const dispatch = useDispatch()

  const { restaurantId } = admin

  const getFilteredList = () => {
    let filteredQrs = qrs
    if (filterKey && filterKey.length && qrs) {
      filteredQrs = qrs.filter(
        (qr) => qr.value.toLowerCase().includes(filterKey.toLowerCase())
      )
    }
    return filteredQrs
  }

  const paginate = (list) => {
    let paginatedList = list ? [ ...list ] : list
    if (currentIndex && list && list.length) {
      paginatedList = paginatedList.slice(((currentIndex * PER_PAGE_COUNTS) - PER_PAGE_COUNTS), (currentIndex * PER_PAGE_COUNTS))
    }
    return paginatedList
  }

  return (
    <div className="Container">
      <h2>Tables Management</h2>
      <div className="TopOptionsContainer">
        <div className="TopInputContainer">
          <Input 
            placeholder="Search Table (by Table No.)"
            type="number"
            value={filterKey}
            onChange={({ target: { value } }) => {
              if (value !== '0') {
                setfilterKey(value < 0 ? `${value * -1}` : value)
                setcurrentIndex(1)
              }
            }}
          />
        </div>
        <div className="TopButtonContainer">
          <Button
            text={filterKey ? "Clear" : fetchingQrs ? "Syncing" : "Refresh"}
            light={fetchingQrs}
            lightAction={() => null}
            iconLeft={<i className={`fa fa-${filterKey ? 'times-circle' : fetchingQrs ? 'refresh fa-pulse' : 'refresh'}`} />}
            onClick={() => filterKey ? setfilterKey('') : dispatch(customisedAction(GET_EXISTING_QRS, { restaurantId }))} />
        </div>
      </div>
      <TablesList history={props.history} fetchingQrs={fetchingQrs} restaurantId={restaurantId} tables={paginate(getFilteredList())} />
      {getFilteredList() && getFilteredList().length && getFilteredList().length > PER_PAGE_COUNTS ? 
        <Pagination
          currentIndex={currentIndex}
          mappingCounts={Array(parseInt(getFilteredList().length / PER_PAGE_COUNTS) + 1).fill('0')}
          totalCounts={getFilteredList().length}
          perPageCounts={PER_PAGE_COUNTS}
          onClick={(index) => setcurrentIndex(index)}
        />
      : null}
    </div>
  )
}

export default Tables
