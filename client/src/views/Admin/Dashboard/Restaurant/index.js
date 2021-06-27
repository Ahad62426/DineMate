import React, { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import { Button, DashboardGridItem, DashboardTimer, DropDown, ServiceQueItem } from '../../../../components'
import { ASSIGN_TABLES_TO_STAFF, CLEAR_TABLE_ORDERS, GET_RESTAURANT_DASHBOARD, MERGE_TABLES, SET_TOAST, SET_TOAST_DISMISSING, UN_MERGE_TABLES } from '../../../../constants'
import { customisedAction } from '../../../../redux/actions'

function Restaurant(props) {

  const [merging, setmerging] = useState(false)
  const [selectedTables, setselectedTables] = useState([])
  const [managingStaff, setmanagingStaff] = useState(false)
  const [selectedStaff, setselectedStaff] = useState(null)
  const [assignedTables, setassignedTables] = useState([])
  const [hoveredTable, sethoveredTable] = useState(null)

  const admin = useSelector(({ sessionReducer }) => sessionReducer.admin)
  const fetchingDashboard = useSelector(({ dashboardReducer }) => dashboardReducer.fetchingDashboard)
  const restaurantDashboard = useSelector(({ dashboardReducer }) => dashboardReducer.restaurantDashboard)
  const mergingTables = useSelector(({ dashboardReducer }) => dashboardReducer.mergingTables)
  const unMergingTables = useSelector(({ dashboardReducer }) => dashboardReducer.unMergingTables)
  const fetchingServicesQue = useSelector(({ dashboardReducer }) => dashboardReducer.fetchingServicesQue)
  const servicesQue = useSelector(({ dashboardReducer }) => dashboardReducer.servicesQue)
  const users = useSelector(({ usersReducer }) => usersReducer.users)
  const fetchingStaffAssignedTables = useSelector(({ staffReducer }) => staffReducer.fetchingStaffAssignedTables)
  const staffAssignedTables = useSelector(({ staffReducer }) => staffReducer.staffAssignedTables)
  const assigningTablesToStaff = useSelector(({ staffReducer }) => staffReducer.assigningTablesToStaff)
  const dispatch = useDispatch()

  const { restaurantId, role } = admin

  useEffect(() => {
    if (!mergingTables) cancelMerge()
    if (!mergingTables && !unMergingTables) sethoveredTable(null)
    if (!assigningTablesToStaff) cancelStaffManagement()
  }, [mergingTables, unMergingTables, assigningTablesToStaff])

  const getUnmergedTables = () => {
    let unMergedTables = restaurantDashboard
    if (restaurantDashboard) {
      unMergedTables = restaurantDashboard.filter(
        (table) => !table.mergeId
      )
    }
    getGroupedMergedTables()
    return unMergedTables
  }

  const getMergedTables = () => {
    let mergedTables = []
    if (restaurantDashboard) {
      mergedTables = restaurantDashboard.filter(
        (table) => table.mergeId
      )
    }
    return mergedTables
  }

  const getGroupedMergedTables = () => {
    let groupedMergedTables = []
    if (getMergedTables() && getMergedTables().length) {
      groupedMergedTables = getMergedTables().reduce((r, a) => {
        r[a.mergeId] = r[a.mergeId] || [];
        r[a.mergeId].push(a);
        return r;
      }, Object.create(null));
    }
    return groupedMergedTables
  }

  const getUnmergedColumnCounts = () => {
    let counts = 0
    if (getMergedTables().length) {
      if (getMergedTables().length > 3) counts = 2
      else counts = 1
    }
    return (4 - counts)
  }

  const getMergedColumnCounts = () => {
    if (getUnmergedColumnCounts() === 3) {
      if (getUnmergedTables().length > 2) return 4
      else if (getUnmergedTables().length > 1) return 3
      else if (getUnmergedTables().length) return 2
      else return 1
    }
    else if (getUnmergedColumnCounts() === 2) {
      if (getUnmergedTables().length > 1) return 3
      else if (getUnmergedTables().length) return 2
      else return 1
    }
  }

  const getMergedRowCounts = (groupIndex) => {
    let mergedRowCounts = 0, index = groupIndex
    while (index - 2 > -1) {
      index = index - 2
      Object.keys(getGroupedMergedTables()).map((key, currentIndex) => {
        if (currentIndex === index)
          mergedRowCounts = mergedRowCounts + getGroupedMergedTables()[key].length
      })
    }
    return mergedRowCounts
  }

  const cancelMerge = () => {
    setmerging(false)
    setselectedTables([])
  }

  const setAssignedTablesView = (staffId) => {
    if (fetchingStaffAssignedTables) {
      setselectedStaff(null)
      dispatch(customisedAction(SET_TOAST, { message: 'Staff assigned tables fetching is in progress!', type: 'warning' }))
    } else {
      dispatch(customisedAction(SET_TOAST_DISMISSING))
      setselectedStaff(staffId)
      const staff = staffAssignedTables.filter(staff => staff.id == staffId)
      if (staff.length) {
        setassignedTables(staff[0].assignedTables.split(','))
      } else setassignedTables([])
    }
  }

  const assignTable = (tableNumber) => {
    if (selectedStaff) {
      let temp = [...assignedTables]
      if (temp.includes(tableNumber))
        temp = assignedTables.filter((assignedTable) => assignedTable != tableNumber)
      else temp.push(tableNumber)
      setassignedTables(temp)
    } else {
      dispatch(customisedAction(SET_TOAST_DISMISSING))
      dispatch(customisedAction(SET_TOAST, { message: 'Select staff first!', type: 'error' }))
    }
  }

  const cancelStaffManagement = () => {
    setmanagingStaff(false)
    setselectedStaff(null)
    setassignedTables([])
  }

  const selectTable = (id) => {
    let temp = []
    if (selectedTables.includes(id))
      temp = selectedTables.filter((tableId) => tableId !== id)
    else {
      temp = [...selectedTables]
      temp.push(id)
    }
    setselectedTables(temp)
  }

  const getTableById = (id) => {
    const tables = restaurantDashboard.filter(table => table.id === id)
    return tables.length && tables[0]
  }

  const mergeTables = () => {
    dispatch(customisedAction(SET_TOAST_DISMISSING))
    if (selectedTables && selectedTables.length) {
      if (selectedTables.length < 2 || selectedTables.length > 3)
        dispatch(customisedAction(SET_TOAST, { message: 'Select Minimum 2 & Maximum 3 Tables!', type: 'error' }))
      else dispatch(customisedAction(MERGE_TABLES, {
        selectedTables,
        mergeId: getTableById(Math.min(...selectedTables)).value,
        restaurantId
      }))
    } else {
      dispatch(customisedAction(SET_TOAST, { message: 'No Tables Selected!', type: 'error' }))
    }
  }

  const assignTables = () => {
    dispatch(customisedAction(SET_TOAST_DISMISSING))
    dispatch(customisedAction(ASSIGN_TABLES_TO_STAFF, {
      selectedStaff, assignedTables, restaurantId
    }))
  }

  const unMergeTables = (mergeId) => dispatch(customisedAction(UN_MERGE_TABLES, { mergeId, restaurantId }))

  let row = 1
  return (
    <div className="Container">
      <div className="PageTitleContainer">
        <h2>Dashboard</h2>
        <div className="PageTitleButtonContainer">
          {managingStaff ?
            <div>
              <DropDown
                style={{ marginTop: '0px', marginBottom: '0px' }}
                placeholder="Select staff"
                options={users ? users.filter(user => user.role === 'Staff').map(user => {
                  return {
                    label: user.name,
                    value: user.id
                  }
                }) : []}
                value={selectedStaff}
                onChange={({ target: { value } }) => setAssignedTablesView(value)}
              />
            </div> : null
          }
          {restaurantDashboard && !merging ?
            <Button
              style={{ marginLeft: managingStaff ? '10px' : '' }}
              text={`${managingStaff ? "Cancel " : "Manage Staff"}`}
              light={fetchingDashboard || managingStaff || mergingTables || unMergingTables || assigningTablesToStaff}
              lightAction={() => {
                if (managingStaff) {
                  cancelStaffManagement()
                }
              }}
              iconLeft={<i className={`fa ${managingStaff ? 'fa-times-circle' : 'fa-user'}`} />}
              onClick={() => setmanagingStaff(true)}
            /> : null
          }
          {role !== 'Staff' && restaurantDashboard && !managingStaff ?
            <Button
              style={{ marginLeft: '10px' }}
              text={`${merging ? "Cancel " : "Merge"}`}
              light={fetchingDashboard || merging || mergingTables || unMergingTables || assigningTablesToStaff}
              lightAction={() => merging ? cancelMerge() : null}
              iconLeft={<i className={`fa ${merging ? 'fa-times-circle' : 'fa-columns'} fa-rotate-90`} />}
              onClick={() => setmerging(true)}
            /> : null
          }
          <Button
            style={{ marginLeft: '10px' }}
            text={fetchingDashboard || fetchingServicesQue ? "Syncing" : merging || managingStaff ? "Submit" : "Refresh"}
            light={fetchingDashboard || fetchingServicesQue || mergingTables || unMergingTables || assigningTablesToStaff}
            lightAction={() => null}
            iconLeft={<i className={`fa ${merging || managingStaff ? 'fa-send' : 'fa-refresh'} ${fetchingDashboard || fetchingServicesQue ? 'fa-pulse' : ''}`} />}
            onClick={() => {
              if (merging) mergeTables()
              else if (managingStaff) assignTables()
              else {
                sethoveredTable(null)
                dispatch(customisedAction(GET_RESTAURANT_DASHBOARD, { restaurantId }))
              }
            }} />
        </div>
      </div>
      {fetchingDashboard && !restaurantDashboard ?
        <div className="DashBoardContainer">
          <div className="loadingContainer">
            <p><i className={`fa fa-refresh ${fetchingDashboard ? 'fa-pulse' : ''}`} style={{ padding: '0px 5px' }} />Fetching / Syncing Dashboard Data . . .</p>
          </div>
        </div> : null
      }
      <div className="RestaurantDashBoardContainer">
        {restaurantDashboard ? <>
          <div className="DashBoardColumnsContainer">
            <div className="DashBoardGridsContainer">
              <div className="DashBoardGrids">
                {
                  getUnmergedTables().map((table, index) => {
                    const { id, value, doNotDisturb, occupiedBy } = table
                    if (index >= getUnmergedColumnCounts() && index % getUnmergedColumnCounts() === 0) {
                      row = row + 1
                    }
                    return (<div className="DashboardGridItemContainer" key={id}
                      style={{
                        gridColumn: (index % getUnmergedColumnCounts()) + 1,
                        gridRow: row,
                        backgroundColor: merging || managingStaff ? occupiedBy && merging ? 'white' : 'rgb(245, 222, 179)' : ''
                      }}>
                      <DashboardGridItem
                        text={"Table " + value}
                        doNotDisturb={doNotDisturb}
                        occupiedBy={!managingStaff && occupiedBy}
                        merging={merging || managingStaff}
                        includesMerging={selectedTables.includes(id) || assignedTables.includes(value)}
                        onMouseEnter={() => merging ? null : sethoveredTable(table)}
                        onClick={() => {
                          if (merging && !occupiedBy) selectTable(id)
                          else if (managingStaff) assignTable(value)
                          else if (occupiedBy && !merging) {
                            dispatch(customisedAction(CLEAR_TABLE_ORDERS))
                            props.history.push({
                              pathname: '/client/admin/dashboard/restaurant/tableOrders',
                              state: { restaurantId, tableId: value }
                            })
                          }
                        }}
                      />
                    </div>)
                  })
                }
                {
                  Object.keys(getGroupedMergedTables()).map((key, groupIndex) => {
                    const mergedTables = getGroupedMergedTables()[key]
                    return mergedTables.map((table, index) => {
                      const { id, value, mergeId } = table
                      return (<div className="DashboardGridItemContainer" key={id}
                        style={{
                          gridColumn: getMergedColumnCounts() + (groupIndex % 2),
                          gridRow: getMergedRowCounts(groupIndex) + index + 1,
                          border: '1px solid black',
                          borderTopLeftRadius: index === 0 ? '10px' : '0px',
                          borderTopRightRadius: index === 0 ? '10px' : '0px',
                          borderBottomLeftRadius: index === mergedTables.length - 1 ? '10px' : '0px',
                          borderBottomRightRadius: index === mergedTables.length - 1 ? '10px' : '0px',
                          borderTop: index === 0 ? '1px solid black' : 'none',
                          borderBottom: index === mergedTables.length - 1 ? '1px solid black' : 'none',
                          backgroundColor: merging ? 'white' : managingStaff ? 'rgb(245, 222, 179)' : '',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={() => merging ? null : sethoveredTable(mergedTables)}
                        onClick={() => {
                          if (managingStaff) assignTable(table.mergeId)
                          else if (mergedTables.filter(table => table.occupiedBy).length && !merging) {
                            dispatch(customisedAction(CLEAR_TABLE_ORDERS))
                            props.history.push({
                              pathname: '/client/admin/dashboard/restaurant/tableOrders',
                              state: { restaurantId, tableId: table.mergeId, mergedTables }
                            })
                          }
                        }}
                      >
                        {role !== 'Staff' && !managingStaff ?
                          <i className="fa fa-times-circle"
                            style={{
                              color: 'red',
                              display: !index && !mergedTables.filter(table => table.occupiedBy).length && !merging ? 'block' : 'none',
                              float: 'right',
                              position: 'absolute',
                              top: 5,
                              right: 5
                            }}
                            onClick={() => unMergeTables(mergeId)}
                          /> : null}
                        <DashboardGridItem
                          text={"Table " + value}
                          doNotDisturb={mergedTables.filter(table => table.doNotDisturb).length}
                          occupiedBy={!managingStaff && mergedTables.filter(table => table.occupiedBy).length}
                          includesMerging={assignedTables.includes(mergeId)}
                          merging={merging || managingStaff}
                          merged={!managingStaff}
                        />
                      </div>)
                    })
                  })
                }
              </div>
              <div className="DashboardTableDetailsContainer"
                style={{
                  justifyContent: hoveredTable ? '' : 'center'
                }}>
                {hoveredTable ?
                  <>
                    <p style={{ flex: 1 }}>Amount: $ 0</p>
                    <p>Table - {
                      Array.isArray(hoveredTable) ?
                        hoveredTable.map((table, index) => {
                          return `
                              ${index === hoveredTable.length - 1 ? ' & ' : ''}
                              ${table.value}
                              ${index < hoveredTable.length - 2 ? ', ' : ''}`
                        })
                        : hoveredTable.value
                    }</p>
                    <p style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>Duration: {
                      <DashboardTimer timeStamp={Array.isArray(hoveredTable) ?
                        hoveredTable[0].createdAt
                        : hoveredTable.createdAt} />
                    }</p>
                  </>
                  : <p>Hover on a table to show details!</p>
                }
              </div>
            </div>
            <div className="DashBoardServicesContainer">
              <p>Services Que</p>
              <div>
                {servicesQue ?
                  servicesQue.map(item => {
                    return <ServiceQueItem
                      id={item.id}
                      type={item.type}
                      tableNumber={item.tableNumber}
                      text={item.text}
                      onClick={() => null}
                    />
                  }) : null
                }
              </div>
            </div>
          </div>
        </> : null}
      </div>
    </div>
  )
}

export default Restaurant
