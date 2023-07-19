obs = obslua

-----------------------------------------------------------

-- Script Properties
function script_properties()
    local props = obs.obs_properties_create()
    return props
end

-- Script Description
function script_description()
    return "OpenChat Custom Server Live Status Sync.\nV0.1 - Made by Blerch"
end

-- Script On Load
function script_load(settings)
    --print("Script Load")
    obs.obs_frontend_add_event_callback(on_frontend_event)
end

function on_frontend_event(event)
    --print("Frontend Event:" .. event)
    local actions = {
        [0] = function () end,
        [1] = on_stream_start,
        [2] = function () end,
        [3] = on_stream_stop,
    }
    if event < 4 then
        actions[event]();
    end
end

function on_stream_start()
    print("Stream Started")
end

function on_stream_stop()
    print("Stream Stopped")
end