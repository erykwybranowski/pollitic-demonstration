# Stage 1: Base image with SDK for development and migration tools
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS base
WORKDIR /app
EXPOSE 8080
EXPOSE 5001

# Install the dotnet-ef tool globally
# RUN dotnet tool install --global dotnet-ef
# ENV PATH="$PATH:/root/.dotnet/tools"

# Stage 2: Build and publish the project
FROM base AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["backend.csproj", "./"]

# Restore dependencies
RUN dotnet restore "backend.csproj"

# Copy all project files to the container
COPY . .

# Build the project
RUN dotnet build "backend.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Publish the application
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "backend.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# Stage 3: Final runtime image
FROM base AS final
WORKDIR /app

# Optional: Install additional debugging tools
RUN apt-get update && apt-get install -y netcat-openbsd default-mysql-client

# Copy published app
COPY --from=publish /app/publish .

# Add the source files for dotnet ef usage
COPY --from=build /src /app

# Set the working directory to the app directory for running the app
WORKDIR /app

# Set entrypoint
ENTRYPOINT ["dotnet", "backend.dll"]
