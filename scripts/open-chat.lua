obs = obslua

-----------------------------------------------------------

-- Script Properties
function script_properties()
	local props = obs.obs_properties_create()
	return props
end

-- Script Description
function script_description()
    return "Connects to OpenChat Custom Server.\nV0.1 - Made by Blerch"
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

function get_service()
    local service = obs.obs_frontend_get_streaming_service()
    local name = obs.obs_service_get_name(service)
    local url = obs.obs_service_get_url(service)
    return { name = name, url = url }
end

function on_stream_start()
    print("Stream Started")
    local table = get_service()
    print(' -> Service Name: ' .. table.name .. ' - Url: ' .. table.url)
end

function on_stream_stop()
    print("Stream Stopped")
    local table = get_service()
    print(' -> Service Name: ' .. table.name .. ' - Url: ' .. table.url)
end

function log_table(t)
    if type(t) == 'table' then
        local s = '{'
        for k,v in pairs(t) do
            if type(k) ~= 'number' then k = '"' end
            s = s .. '['..k..'] = ' .. dump(v) .. ','
        end
        return s .. '}'
    else
        return tostring(t)
    end
end

-- needs pointer to a pointer, cant do in lua
function log_properties(prop, loop)
    if loop == nil then
        loop = 0
    end

    if loop > 10 or not type(loop) == 'number' then
        print('Did 10 loops, ending early, or type is not number')
        return
    end

    local name = obs.obs_property_name(prop)
    local type = obs.obs_property_text_type(prop)
    print(' | ' .. name .. ' -> ' .. type)
    if obs.obs_property_next(prop) then
        log_properties(prop, loop + 1) -- prop needs to be pointed to
    end
end