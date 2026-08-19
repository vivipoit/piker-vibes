import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'

import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/charts/styles.css'

import App from './App'
import { AccountFilterProvider } from './context/AccountFilterContext'
import { CsvDataProvider } from './context/CsvDataContext'
import { DisplayCurrencyProvider } from './context/DisplayCurrencyContext'
import { FxRateProvider } from './context/FxRateContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MantineProvider defaultColorScheme="dark">
        <Notifications />
        <CsvDataProvider>
          <FxRateProvider>
            <DisplayCurrencyProvider>
              <AccountFilterProvider>
                <App />
              </AccountFilterProvider>
            </DisplayCurrencyProvider>
          </FxRateProvider>
        </CsvDataProvider>
      </MantineProvider>
    </BrowserRouter>
  </React.StrictMode>
)
