import React from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ClientData, ProjectData } from '../App'
import type { ImageFile } from '../types'
import { getProjectsByClient, getTotalImagesForClient, getLatestProjectForClient, getProjectCover } from '../App'

interface ClientsDashboardProps {
  clients: ClientData[]
  projects: ProjectData[]
  imageRegistry: Record<string, ImageFile>
  onSelectClient: (id: string) => void
  onBack: () => void
}

export function ClientsDashboard({ clients, projects, imageRegistry, onSelectClient, onBack }: ClientsDashboardProps) {
  return (
    <div className="cd">
      <div className="cd__inner">
        <div className="cd__top-bar">
          <button className="cd__back" onClick={onBack}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Workspace
          </button>
        </div>

        <h1 className="cd__title">CLIENTS</h1>

        {clients.length > 0 ? (
          <div className="cd__grid">
            {clients.map(c => {
              const clientProjects = getProjectsByClient(c.id, projects)
              const totalImages = getTotalImagesForClient(c.id, projects)
              const latestProject = getLatestProjectForClient(c.id, projects)
              const coverPath = latestProject ? getProjectCover(latestProject, imageRegistry) : null

              return (
                <div key={c.id} className="cd__card" onClick={() => onSelectClient(c.id)}>
                  <div className="cd__card-cover">
                    {coverPath ? (
                      <img src={toLocalURL(coverPath)} alt="" className="cd__card-img" />
                    ) : (
                      <div className="cd__card-placeholder">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="cd__card-info">
                    <span className="cd__card-name">{c.name}</span>
                    <span className="cd__card-count">{clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}</span>
                    <span className="cd__card-count">{totalImages} image{totalImages !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="cd__empty">
            <p className="cd__empty-text">No clients yet. Create a project with a client name to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
